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
    const body = method === "POST" ? await request.arrayBuffer() : undefined;

    let upstream: Response;
    try {
        upstream = await fetch(targetUrl.toString(), {
            method,
            body: body ?? undefined,
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
            redirect: "follow",
        });
    } catch (err) {
        return jsonError(
            502,
            `Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

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

    // Buffer the FULL response, then return it. Deliberately NOT streamed:
    // Node's fetch (undici) auto-decompresses gzip/br bodies, so the upstream
    // Content-Length (compressed size) no longer matches the decompressed
    // bytes. A hand-rolled streaming proxy that forwards that header — or
    // whose background writer is cut short by the Node adapter — truncates the
    // JSON mid-stream ("Overpass returned data that is not valid JSON").
    // Buffering lets `new Response(buf)` set a correct Content-Length and
    // makes truncation impossible. These APIs return a few MB at most.
    let buf: ArrayBuffer;
    try {
        buf = await upstream.arrayBuffer();
    } catch (err) {
        return jsonError(
            502,
            `Failed reading upstream body: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    if (buf.byteLength > MAX_BYTES) {
        return jsonError(
            413,
            `Response is ${buf.byteLength} bytes, cap is ${MAX_BYTES}.`,
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

function isAllowedHost(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => lower === h || lower.endsWith(`.${h}`));
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
    return new Response(JSON.stringify({ error: message }), { status, headers });
}
