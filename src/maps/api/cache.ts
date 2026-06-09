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

/** fetch() that aborts after the query's own [timeout:N] budget (+ buffer, capped
 *  by MAX) so a hang can't freeze the app while a valid slow query still finishes.
 *  Falls back to a plain fetch if AbortSignal.timeout is unavailable. */
export const timedFetch = (url: string, init?: RequestInit): Promise<Response> =>
    fetch(url, {
        ...init,
        signal:
            typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
                ? AbortSignal.timeout(fetchTimeoutMs(url, init))
                : init?.signal,
    });

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
