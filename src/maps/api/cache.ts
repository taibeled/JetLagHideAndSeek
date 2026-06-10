import memoize from "lodash/memoize";
import { toast } from "react-toastify";

import { CacheType } from "@/maps/api/types";

const determineQuestionCache = memoize(() => caches.open(CacheType.CACHE));
const determineZoneCache = memoize(() => caches.open(CacheType.ZONE_CACHE));
const determinePermanentCache = memoize(() =>
    caches.open(CacheType.PERMANENT_CACHE),
);

const inFlightFetches = new Map<string, Promise<Response>>();

/**
 * Client-side abort timeout for Overpass/boundary fetches. Its job is to stop a
 * genuinely HUNG connection from leaving the fetch pending forever (with
 * `isLoading` stuck `true`, freezing the UI) — NOT to cut off a slow-but-valid
 * query. A medium/large territory's query explicitly asks Overpass for up to
 * `[timeout:240]`, so a flat short timeout wrongly aborts it (→ 599 → blank map
 * even after reload). Derive the budget from the query's own `[timeout:N]`
 * (in the GET URL or the POST body) plus network/proxy overhead, capped by MAX.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const MAX_FETCH_TIMEOUT_MS = 300_000; // hard backstop against a true hang
const FETCH_TIMEOUT_BUFFER_MS = 30_000; // proxy + network overhead beyond [timeout:N]

function fetchTimeoutMs(url: string, init?: RequestInit): number {
    const body = typeof init?.body === "string" ? init.body : "";
    // Matches `timeout:240` and the URL-encoded `timeout%3A240`.
    const match = `${url}${body}`.match(/timeout(?:%3A|:)(\d+)/i);
    const serverSec = match ? Number.parseInt(match[1]!, 10) : NaN;
    if (Number.isFinite(serverSec) && serverSec > 0) {
        return Math.min(
            serverSec * 1000 + FETCH_TIMEOUT_BUFFER_MS,
            MAX_FETCH_TIMEOUT_MS,
        );
    }
    return DEFAULT_FETCH_TIMEOUT_MS;
}

/**
 * User-triggered cancellation. Separate from the per-fetch timeout above: the
 * timeout stops a genuine HANG, this lets a player abort a slow-but-running
 * operation they started by mistake (e.g. a fat-fingered radius or an
 * accidental whole-continent boundary) instead of waiting out the full
 * `[timeout:N]` budget.
 *
 * Every `timedFetch` subscribes to the current controller's signal, so a
 * single `cancelInFlightRequests()` aborts ALL in-flight requests at once.
 * Aborting also bumps `cancelEpoch`: orchestration loops that retry on failure
 * (see `getOverpassData`) capture the epoch at entry and bail silently when it
 * changes, so a cancel doesn't just trip a retry. A fresh controller is
 * installed immediately so requests started after the cancel work normally.
 */
let userAbortController: AbortController | null = null;
let cancelEpoch = 0;

function ensureUserAbortController(): AbortController {
    if (!userAbortController) userAbortController = new AbortController();
    return userAbortController;
}

/** Signal that fires when the user cancels. Always returns a live signal. */
export function userCancelSignal(): AbortSignal {
    return ensureUserAbortController().signal;
}

/** Monotonic counter; changes each time the user cancels. */
export function currentCancelEpoch(): number {
    return cancelEpoch;
}

/** True if `epoch` is stale, i.e. a cancel happened since it was captured. */
export function wasCancelledSince(epoch: number): boolean {
    return cancelEpoch !== epoch;
}

/**
 * Abort every in-flight request the user can see and arm a fresh controller
 * for subsequent ones. Does NOT touch loading/progress UI — callers pair this
 * with their own state reset (see `GlobalProgressBar`).
 */
export function cancelInFlightRequests(): void {
    userAbortController?.abort();
    userAbortController = new AbortController();
    cancelEpoch++;
}

/** True if the error is a user/timeout abort rather than a real failure. */
export function isAbortLikeError(error: unknown): boolean {
    const name = error instanceof Error ? error.name : "";
    return name === "AbortError" || name === "TimeoutError";
}

/**
 * Reconstruct the upstream URL from a `/api/proxy-api?url=…` URL, replicating
 * the server's param folding: the `url` query param is the base (callers may
 * have appended a path and params that fold into its value), and every other
 * query param is forwarded as a sibling. Returns null for non-proxied URLs.
 */
export function directUrlFromProxied(url: string): string | null {
    try {
        const u = new URL(
            url,
            typeof location !== "undefined"
                ? location.origin
                : "http://localhost",
        );
        if (u.pathname !== "/api/proxy-api") return null;
        const target = u.searchParams.get("url");
        if (!target || !/^https?:\/\//i.test(target)) return null;
        const direct = new URL(target);
        for (const [key, value] of u.searchParams) {
            if (key !== "url") direct.searchParams.append(key, value);
        }
        return direct.toString();
    } catch {
        return null;
    }
}

/**
 * Once a direct (browser → API) request fails with a network-level error —
 * the signature of an ad blocker, a CORS strip, or a dead connection — stop
 * trying direct for the rest of this page load and go straight to the proxy.
 * Per-page-load on purpose: the next visit retries direct.
 */
let directNetworkBlocked = false;

/**
 * fetch() that aborts after the query's own [timeout:N] budget (+ buffer,
 * capped by MAX) so a hang can't freeze the app while a valid slow query
 * still finishes. Falls back to a plain fetch if AbortSignal.timeout is
 * unavailable.
 *
 * Proxied URLs try the DIRECT upstream first and use /api/proxy-api only as
 * a fallback. Overpass, Nominatim, and Photon all serve permissive CORS (the
 * upstream app talks to them straight from the browser) — going direct means
 * each player's own IP carries their rate-limit footprint instead of every
 * request funneling through the single Railway egress IP, which is what made
 * Overpass 429s and Nominatim refusals an at-scale problem. The proxy stays
 * as the fallback for browsers with ad blockers (the reason it exists).
 * Timeouts/aborts do NOT trigger the fallback — a query that exhausted its
 * budget directly is just slow, and re-running it through the proxy would
 * double the wait for the same result.
 */
export const timedFetch = async (
    url: string,
    init?: RequestInit,
): Promise<Response> => {
    // Combine the per-request hang timeout, the global user-cancel signal, and
    // any caller-supplied signal so the fetch aborts on whichever fires first.
    const combinedSignal = (target: string): AbortSignal | undefined => {
        const parts: AbortSignal[] = [];
        if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
            parts.push(AbortSignal.timeout(fetchTimeoutMs(target, init)));
        }
        parts.push(userCancelSignal());
        if (init?.signal) parts.push(init.signal);

        if (parts.length === 1) return parts[0];
        if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
            return AbortSignal.any(parts);
        }
        // Old browser without AbortSignal.any: fall back to the first signal
        // (the timeout when present) — user-cancel is best-effort here.
        return parts[0];
    };

    const doFetch = (target: string) =>
        fetch(target, {
            ...init,
            signal: combinedSignal(target),
        });

    const direct = directNetworkBlocked ? null : directUrlFromProxied(url);
    if (direct) {
        try {
            return await doFetch(direct);
        } catch (error) {
            const name = error instanceof Error ? error.name : "";
            if (name === "AbortError" || name === "TimeoutError") {
                throw error;
            }
            directNetworkBlocked = true;
        }
    }
    return doFetch(url);
};

/** Busy upstream / rate limit — Overpass mirror sweep or getOverpassData retry often recovers. */
const TRANSIENT_FETCH_STATUSES = new Set([408, 429, 502, 503, 504, 507, 529]);
const MAX_FETCH_FAILURE_LOG_ENTRIES = 100;

function reportFetchFailure(args: {
    url: string;
    cacheType: CacheType;
    loadingText?: string;
    status?: number;
    statusText?: string;
    error?: unknown;
}) {
    const status = args.status ?? 599;
    const transient =
        typeof status === "number" && TRANSIENT_FETCH_STATUSES.has(status);
    const payload = {
        url: args.url,
        cacheType: args.cacheType,
        loadingText: args.loadingText,
        status,
        statusText: args.statusText ?? "Network Error",
        error:
            args.error instanceof Error
                ? args.error.message
                : args.error != null
                  ? String(args.error)
                  : undefined,
        timestamp: new Date().toISOString(),
        transient,
    };
    if (typeof window !== "undefined") {
        const w = window as Window & { __jlFetchFailures?: unknown };
        if (!Array.isArray(w.__jlFetchFailures)) {
            w.__jlFetchFailures = [];
        }
        const failures = w.__jlFetchFailures as unknown[];
        failures.push(payload);
        if (failures.length > MAX_FETCH_FAILURE_LOG_ENTRIES) {
            failures.splice(0, failures.length - MAX_FETCH_FAILURE_LOG_ENTRIES);
        }
    }
    const label = transient
        ? "[cacheFetch] HTTP failure (often recovers via another Overpass mirror or retry)"
        : "[cacheFetch] request failed";
    console.error(label, payload);
}

export const determineCache = async (cacheType: CacheType) => {
    switch (cacheType) {
        case CacheType.CACHE:
            return await determineQuestionCache();
        case CacheType.ZONE_CACHE:
            return await determineZoneCache();
        case CacheType.PERMANENT_CACHE:
            return await determinePermanentCache();
    }
};

export const cacheFetch = async (
    url: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
) => {
    try {
        const cache = await determineCache(cacheType);

        const cachedResponse = await cache.match(url);
        if (cachedResponse) {
            if (!cachedResponse.ok) {
                await cache.delete(url);
            } else {
                return cachedResponse.clone();
            }
        }

        const inflightKey = `${cacheType}:${url}`;
        const existingFetch = inFlightFetches.get(inflightKey);
        if (existingFetch) {
            const response = await existingFetch;
            return response.clone();
        }

        const fetchAndMaybeCache = async () => {
            let response: Response;
            try {
                response = await timedFetch(url);
            } catch (error) {
                reportFetchFailure({
                    url,
                    cacheType,
                    loadingText,
                    error,
                });
                response = new Response("", {
                    status: 599,
                    statusText: "Network Error",
                });
            }
            if (response.ok) {
                await cache.put(url, response.clone());
            } else {
                reportFetchFailure({
                    url,
                    cacheType,
                    loadingText,
                    status: response.status,
                    statusText: response.statusText,
                });
                await cache.delete(url);
            }
            return response;
        };

        const fetchPromise = fetchAndMaybeCache();
        inFlightFetches.set(inflightKey, fetchPromise);

        try {
            const response = await (loadingText
                ? toast.promise(fetchPromise, {
                      pending: loadingText,
                  })
                : fetchPromise);

            return response.clone();
        } finally {
            inFlightFetches.delete(inflightKey);
        }
    } catch (e) {
        console.log(e); // Probably a caches not supported error
        try {
            const response = await timedFetch(url);
            if (!response.ok) {
                reportFetchFailure({
                    url,
                    cacheType,
                    loadingText,
                    status: response.status,
                    statusText: response.statusText,
                });
            }
            return response;
        } catch (error) {
            reportFetchFailure({
                url,
                cacheType,
                loadingText,
                error,
            });
            return new Response("", {
                status: 599,
                statusText: "Network Error",
            });
        }
    }
};

export const clearCache = async (cacheType: CacheType = CacheType.CACHE) => {
    try {
        const cache = await determineCache(cacheType);
        await cache.keys().then((keys) => {
            keys.forEach((key) => {
                cache.delete(key);
            });
        });
    } catch (e) {
        console.log(e); // Probably a caches not supported error
    }
};
