/**
 * Contract tests for the /api/proxy-api endpoint.
 *
 * This proxy is the single choke point for Overpass / Nominatim / Photon, and
 * every regression in it this development cycle took down the deployed app:
 *   - dropping query params after the first  → "Photon is down", broken boundaries
 *   - forwarding the upstream Content-Length → truncated JSON
 *   - not forwarding Retry-After             → ignored rate-limit backoff
 *   - allow-list / method handling
 *
 * These tests mock global `fetch` and invoke the route handlers directly, so
 * they pin the proxy's wire contract without a running server.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/pages/api/proxy-api";

const APP_ORIGIN = "https://app.example.com";

/** Build the {request, url} pair an Astro APIRoute receives for a given URL. */
function ctx(fullUrl: string, init?: RequestInit) {
    return {
        request: new Request(fullUrl, init),
        url: new URL(fullUrl),
    } as Parameters<typeof GET>[0];
}

/** Install a fetch mock that records calls and returns a canned upstream. */
function mockUpstream(resp: () => Response) {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
        (input: any, init?: any) => {
            calls.push({ url: String(input), init });
            return Promise.resolve(resp());
        },
    );
    return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("/api/proxy-api wire contract", () => {
    it("forwards EVERY appended query param to the upstream (param-drop regression)", async () => {
        // The browser builds `${proxyBase}?q=..&format=..`, which collapses to
        // /api/proxy-api?url=<enc-base>?q=..&format=.. — the parser folds the
        // first param into `url` and leaves the rest as siblings on our request.
        const calls = mockUpstream(
            () =>
                new Response("[]", {
                    headers: { "content-type": "application/json" },
                }),
        );
        const base = "https://nominatim.openstreetmap.org/search";
        const fullUrl =
            `${APP_ORIGIN}/api/proxy-api?url=${encodeURIComponent(base)}` +
            `?q=Hartford&format=json&polygon_geojson=1&limit=1`;

        const res = await GET(ctx(fullUrl));
        expect(res.status).toBe(200);
        expect(calls).toHaveLength(1);

        const fetched = new URL(calls[0]!.url);
        expect(fetched.origin + fetched.pathname).toBe(base);
        // Every param must reach the upstream — this is the bug that 400'd Photon.
        expect(fetched.searchParams.get("q")).toBe("Hartford");
        expect(fetched.searchParams.get("format")).toBe("json");
        expect(fetched.searchParams.get("polygon_geojson")).toBe("1");
        expect(fetched.searchParams.get("limit")).toBe("1");
        // The proxy's own `url` param must NOT leak to the upstream.
        expect(fetched.searchParams.has("url")).toBe(false);
    });

    it("does not propagate a stale upstream Content-Length (truncation regression)", async () => {
        // undici auto-decompresses gzip, so the upstream Content-Length is the
        // COMPRESSED size. The proxy must not echo it; the returned body's
        // length must match the actual (decompressed) bytes.
        const body = "x".repeat(5000);
        const calls = mockUpstream(
            () =>
                new Response(body, {
                    headers: {
                        "content-type": "application/json",
                        // A deliberately wrong (tiny) length, as a gzip CL would be.
                        "content-length": "42",
                    },
                }),
        );
        const fullUrl = `${APP_ORIGIN}/api/proxy-api?url=${encodeURIComponent(
            "https://overpass-api.de/api/interpreter?data=x",
        )}`;
        const res = await GET(ctx(fullUrl));
        expect(calls).toHaveLength(1);

        const cl = res.headers.get("content-length");
        // Either unset, or correct for the real body — never the stale "42".
        expect(cl).not.toBe("42");
        const text = await res.text();
        expect(text).toBe(body);
        expect(text.length).toBe(5000);
    });

    it("forwards upstream status and Retry-After on rate-limit responses", async () => {
        mockUpstream(
            () =>
                new Response("rate limited", {
                    status: 429,
                    headers: { "retry-after": "30" },
                }),
        );
        const fullUrl = `${APP_ORIGIN}/api/proxy-api?url=${encodeURIComponent(
            "https://overpass-api.de/api/interpreter?data=x",
        )}`;
        const res = await GET(ctx(fullUrl));
        expect(res.status).toBe(429);
        expect(res.headers.get("retry-after")).toBe("30");
    });

    it("rejects hosts not on the allow-list with 403", async () => {
        const calls = mockUpstream(() => new Response("ok"));
        const fullUrl = `${APP_ORIGIN}/api/proxy-api?url=${encodeURIComponent(
            "https://evil.example.com/steal",
        )}`;
        const res = await GET(ctx(fullUrl));
        expect(res.status).toBe(403);
        // Must never have hit the network.
        expect(calls).toHaveLength(0);
    });

    it("returns 400 when the url param is missing or malformed", async () => {
        mockUpstream(() => new Response("ok"));
        expect((await GET(ctx(`${APP_ORIGIN}/api/proxy-api`))).status).toBe(
            400,
        );
        expect(
            (await GET(ctx(`${APP_ORIGIN}/api/proxy-api?url=not-a-url`)))
                .status,
        ).toBe(400);
    });

    it("POST forwards the request body and content-type to the upstream", async () => {
        const calls = mockUpstream(
            () =>
                new Response("[]", {
                    headers: { "content-type": "application/json" },
                }),
        );
        const fullUrl = `${APP_ORIGIN}/api/proxy-api?url=${encodeURIComponent(
            "https://overpass-api.de/api/interpreter",
        )}`;
        const res = await POST(
            ctx(fullUrl, {
                method: "POST",
                body: "data=[out:json];node(1);out;",
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                },
            }),
        );
        expect(res.status).toBe(200);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.init?.method).toBe("POST");
        const sentBody = calls[0]!.init?.body;
        const sentText =
            typeof sentBody === "string"
                ? sentBody
                : new TextDecoder().decode(sentBody as ArrayBuffer);
        expect(sentText).toContain("out:json");
    });

    it("blocks a redirect to a non-allow-listed host (SSRF guard)", async () => {
        // Allow-listed upstream tries to bounce us to internal metadata.
        const calls = mockUpstream(
            () =>
                new Response(null, {
                    status: 302,
                    headers: {
                        location: "http://169.254.169.254/latest/meta-data/",
                    },
                }),
        );
        const fullUrl = `${APP_ORIGIN}/api/proxy-api?url=${encodeURIComponent(
            "https://overpass-api.de/api/interpreter?data=x",
        )}`;
        const res = await GET(ctx(fullUrl));
        expect(res.status).toBe(403);
        // Only the first hop was fetched; the redirect target was never hit.
        expect(calls).toHaveLength(1);
    });

    it("follows a redirect to an allow-listed host", async () => {
        let n = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(() => {
            n += 1;
            if (n === 1) {
                return Promise.resolve(
                    new Response(null, {
                        status: 302,
                        headers: {
                            location:
                                "https://overpass.kumi.systems/api/interpreter?data=x",
                        },
                    }),
                );
            }
            return Promise.resolve(
                new Response("[]", {
                    headers: { "content-type": "application/json" },
                }),
            );
        });
        const fullUrl = `${APP_ORIGIN}/api/proxy-api?url=${encodeURIComponent(
            "https://overpass-api.de/api/interpreter?data=x",
        )}`;
        const res = await GET(ctx(fullUrl));
        expect(res.status).toBe(200);
        expect(n).toBe(2); // followed exactly one allow-listed hop
    });

    it("returns the full buffered body unchanged for large responses", async () => {
        const big = JSON.stringify({
            elements: Array.from({ length: 2000 }, (_, i) => ({ id: i })),
        });
        mockUpstream(
            () =>
                new Response(big, {
                    headers: { "content-type": "application/json" },
                }),
        );
        const fullUrl = `${APP_ORIGIN}/api/proxy-api?url=${encodeURIComponent(
            "https://overpass.private.coffee/api/interpreter?data=x",
        )}`;
        const res = await GET(ctx(fullUrl));
        const parsed = JSON.parse(await res.text());
        expect(parsed.elements).toHaveLength(2000);
    });
});
