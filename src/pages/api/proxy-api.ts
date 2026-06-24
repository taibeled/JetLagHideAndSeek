/**
 * Server-side proxy for external APIs that ad blockers commonly block:
 *   - Overpass API  (overpass-api.de, overpass.private.coffee, overpass.kumi.systems)
 *   - Nominatim     (nominatim.openstreetmap.org)
 *   - Photon        (photon.komoot.io)
 *
 * Client sends:
 *   GET  /api/proxy-api?url=<encoded-target-url>
 *   POST /api/proxy-api?url=<encoded-target-url>   (body forwarded verbatim)
 *
 * The proxy strips the `url` param from the target (we receive it separately),
 * forwards the method + body, and returns the upstream response.  All requests
 * come from the Railway server IP — invisible to browser ad blockers.
 */

import type { APIRoute } from "astro";

export const prerender = false;

const ALLOWED_HOSTS = [
    "overpass-api.de",
    "overpass.private.coffee",
    "overpass.kumi.systems",
    "nominatim.openstreetmap.org",
    "photon.komoot.io",
];

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — Overpass responses can be large
const MAX_REDIRECTS = 3;
// Hard server-side deadline for the whole upstream request (across redirect
// hops). Overpass can legitimately take tens of seconds on big queries, so
// this is a generous backstop, not a tight SLA — it only exists so a hung
// upstream can't pin a server request open forever after the client leaves.
const MAX_UPSTREAM_MS = 60_000;

// Sentinel returned by readCapped when a body exceeds the byte cap, so callers
// can map it to a 413 without confusing it with an empty body.
const TOO_LARGE = Symbol("too-large");

/**
 * Read a request/response body stream into a single buffer, but abort and
 * return TOO_LARGE the moment the accumulated size exceeds `max` — so an
 * oversized payload is never fully allocated before we reject it. A null body
 * (e.g. GET, 204) reads as empty. Used for BOTH the POST request body and the
 * upstream response so the limit is enforced through one path.
 */
async function readCapped(
    body: ReadableStream<Uint8Array> | null,
    max: number,
): Promise<Uint8Array<ArrayBuffer> | typeof TOO_LARGE> {
    if (!body) return new Uint8Array(0);
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            total += value.byteLength;
            if (total > max) {
                await reader.cancel();
                return TOO_LARGE;
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

async function handleRequest(request: Request, url: URL): Promise<Response> {
    const target = url.searchParams.get("url");
    if (!target) return jsonError(400, "Missing `url` query parameter.");

    let targetUrl: URL;
    try {
        targetUrl = new URL(target);
    } catch {
        return jsonError(400, "Malformed `url` parameter.");
    }

    if (!isAllowedHost(targetUrl.hostname)) {
        return jsonError(403, `Host not on allow-list: ${targetUrl.hostname}`);
    }

    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
        return jsonError(400, `Unsupported protocol: ${targetUrl.protocol}`);
    }

    // The app builds proxied URLs by appending its own query string to the
    // proxy base: `${proxyBase}?a=b&c=d` → `/api/proxy-api?url=<enc-base>?a=b&c=d`.
    // The URL parser folds the FIRST appended param into the `url` value but
    // leaves the rest as sibling params on OUR request. Without re-attaching
    // them, multi-param calls silently lose everything after the first param —
    // e.g. Photon's `q=` (→ 400 "Photon is down") and Nominatim's `format=`/
    // `polygon_geojson=` (→ broken boundaries). Forward every non-`url` param.
    for (const [key, value] of url.searchParams) {
        if (key === "url") continue;
        targetUrl.searchParams.append(key, value);
    }

    const method = request.method;
    // Read the POST body through the SAME capped reader as the response, so an
    // oversized upload is rejected with 413 before its bytes are fully
    // allocated — not buffered in full and then checked.
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (method === "POST") {
        let read: Uint8Array<ArrayBuffer> | typeof TOO_LARGE;
        try {
            read = await readCapped(request.body, MAX_BYTES);
        } catch (err) {
            return jsonError(
                400,
                `Failed reading request body: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
        if (read === TOO_LARGE) {
            return jsonError(
                413,
                `Request body exceeds cap of ${MAX_BYTES} bytes.`,
            );
        }
        body = read;
    }

    // Tie the upstream fetch to (a) the client aborting (browser cancels the
    // request) and (b) a hard server-side deadline, so a hung upstream is
    // never left running after the client gives up. `AbortSignal.any` fires
    // on whichever happens first; the timeout is absolute, shared across all
    // redirect hops in fetchAllowlisted.
    const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(MAX_UPSTREAM_MS),
    ]);

    const result = await fetchAllowlisted(targetUrl, {
        method,
        body: body ?? undefined,
        signal,
        headers: {
            "user-agent": "JetLagHideAndSeek-Proxy/1.0",
            // Forward content-type for POST bodies (Overpass QL)
            ...(body !== undefined
                ? {
                      "content-type":
                          request.headers.get("content-type") ??
                          "application/x-www-form-urlencoded",
                  }
                : {}),
        },
    });
    if (!result.ok) return jsonError(result.status, result.message);
    const upstream = result.response;

    if (!upstream.ok) {
        // Forward Retry-After on rate-limit/unavailable responses (429/503)
        // so overpass.ts can honor the server's requested backoff instead of
        // falling back to its fixed minimum. This is the only place it's
        // meaningful — Retry-After never appears on the 200 path below.
        const retryAfter = upstream.headers.get("retry-after");
        return jsonError(
            upstream.status,
            `Upstream returned HTTP ${upstream.status}: ${upstream.statusText}`,
            retryAfter ? { "retry-after": retryAfter } : undefined,
        );
    }

    // Buffer the response (up to MAX_BYTES), then return it. Deliberately NOT
    // streamed through to the client: Node's fetch (undici) auto-decompresses
    // gzip/br bodies, so the upstream Content-Length (compressed size) no
    // longer matches the decompressed bytes. A hand-rolled streaming proxy
    // that forwards that header — or whose background writer is cut short by
    // the Node adapter — truncates the JSON mid-stream ("Overpass returned
    // data that is not valid JSON"). Buffering lets `new Response(buf)` set a
    // correct Content-Length and makes truncation impossible. The capped
    // reader still stops at MAX_BYTES so an oversized response is rejected
    // mid-stream instead of being allocated in full. These APIs return a few
    // MB at most.
    let buf: Uint8Array<ArrayBuffer> | typeof TOO_LARGE;
    try {
        buf = await readCapped(upstream.body, MAX_BYTES);
    } catch (err) {
        return jsonError(
            502,
            `Failed reading upstream body: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    if (buf === TOO_LARGE) {
        return jsonError(
            413,
            `Response exceeds cap of ${MAX_BYTES} bytes.`,
        );
    }

    const headers = new Headers({
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-type",
        "content-type":
            upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "private, max-age=0, no-cache",
    });

    return new Response(buf, { status: 200, headers });
}

export const GET: APIRoute = ({ request, url }) => handleRequest(request, url);
export const POST: APIRoute = ({ request, url }) => handleRequest(request, url);

type FetchResult =
    | { ok: true; response: Response }
    | { ok: false; status: number; message: string };

/**
 * Fetch `initial` following redirects MANUALLY, re-validating every hop's host
 * against the allow-list. `redirect: "follow"` would chase a 3xx from an
 * allow-listed upstream to ANY host (SSRF — e.g. internal IPs / cloud-metadata
 * endpoints); this keeps every hop on the allow-list. The OSM APIs don't
 * redirect in practice, so this is defense-in-depth, not a hot path.
 */
async function fetchAllowlisted(
    initial: URL,
    init: RequestInit,
): Promise<FetchResult> {
    let current = initial;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let resp: Response;
        try {
            resp = await fetch(current.toString(), {
                ...init,
                redirect: "manual",
            });
        } catch (err) {
            // AbortSignal.timeout fires a TimeoutError; surface that as a 504
            // (gateway timeout) rather than a generic 502 bad gateway. A client
            // abort raises AbortError — still reported, though the client is
            // usually gone by then.
            const isTimeout = err instanceof Error && err.name === "TimeoutError";
            return {
                ok: false,
                status: isTimeout ? 504 : 502,
                message: `Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`,
            };
        }

        const isRedirect =
            resp.status >= 300 &&
            resp.status < 400 &&
            resp.headers.has("location");
        if (!isRedirect) return { ok: true, response: resp };

        const location = resp.headers.get("location")!;
        let next: URL;
        try {
            next = new URL(location, current);
        } catch {
            return {
                ok: false,
                status: 502,
                message: `Upstream redirect had a malformed Location: ${location}`,
            };
        }
        if (next.protocol !== "http:" && next.protocol !== "https:") {
            return {
                ok: false,
                status: 403,
                message: `Redirect to unsupported protocol: ${next.protocol}`,
            };
        }
        if (!isAllowedHost(next.hostname)) {
            return {
                ok: false,
                status: 403,
                message: `Redirect to non-allow-listed host: ${next.hostname}`,
            };
        }
        current = next;
    }
    return {
        ok: false,
        status: 502,
        message: `Too many redirects (>${MAX_REDIRECTS}).`,
    };
}

function isAllowedHost(hostname: string): boolean {
    // Exact match only. Every proxied target (the Overpass mirrors, Nominatim,
    // Photon) is itself an ALLOWED_HOSTS entry — no subdomain is ever proxied —
    // so matching subdomains via endsWith would only widen the SSRF surface
    // (e.g. an attacker-controlled `*.overpass-api.de`) for no functional gain.
    const lower = hostname.toLowerCase();
    return ALLOWED_HOSTS.includes(lower);
}

function jsonError(
    status: number,
    message: string,
    extraHeaders?: Record<string, string>,
): Response {
    const headers: Record<string, string> = {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        ...extraHeaders,
    };
    // Let the browser read retry-after cross-origin when we forward it.
    if (extraHeaders?.["retry-after"]) {
        headers["access-control-expose-headers"] = "retry-after";
    }
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers,
    });
}
