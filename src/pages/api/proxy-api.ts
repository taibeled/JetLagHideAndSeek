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
        return jsonError(
            upstream.status,
            `Upstream returned HTTP ${upstream.status}: ${upstream.statusText}`,
        );
    }

    // Size cap
    const declaredLength = upstream.headers.get("content-length");
    if (declaredLength && parseInt(declaredLength, 10) > MAX_BYTES) {
        return jsonError(413, `Response too large (cap ${MAX_BYTES} bytes)`);
    }

    const { readable, writable } = new TransformStream<
        Uint8Array,
        Uint8Array
    >();
    const writer = writable.getWriter();

    (async () => {
        if (!upstream.body) {
            await writer.close();
            return;
        }
        const reader = upstream.body.getReader();
        let bytes = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                    bytes += value.byteLength;
                    if (bytes > MAX_BYTES) {
                        await writer.abort(new Error("Response exceeded cap"));
                        return;
                    }
                    await writer.write(value);
                }
            }
            await writer.close();
        } catch (err) {
            await writer.abort(err);
        }
    })();

    // IMPORTANT: do NOT forward Content-Length or Content-Encoding.
    // Node's fetch (undici) auto-decompresses gzip/br responses, so the body
    // we re-stream is already decompressed — but the upstream Content-Length
    // describes the COMPRESSED size. Forwarding it makes the client stop
    // reading early, truncating the JSON mid-stream (e.g. Overpass responses
    // cut off at ~50KB). Omitting it lets the response stream chunked so the
    // client reads the full decompressed body.
    const headers = new Headers({
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-type",
        "content-type":
            upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "private, max-age=0, no-cache",
    });

    return new Response(readable, { status: 200, headers });
}

export const GET: APIRoute = ({ request, url }) => handleRequest(request, url);
export const POST: APIRoute = ({ request, url }) => handleRequest(request, url);

function isAllowedHost(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => lower === h || lower.endsWith(`.${h}`));
}

function jsonError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
        },
    });
}
