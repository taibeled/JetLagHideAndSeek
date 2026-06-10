/**
 * Contract tests for directUrlFromProxied — the client-side mirror of the
 * proxy's URL folding. timedFetch uses it to attempt a DIRECT browser→API
 * request before falling back to /api/proxy-api, so the reconstruction here
 * must agree with how src/pages/api/proxy-api.ts builds the upstream URL
 * (url param = base, every sibling param forwarded).
 */
import { describe, expect, it } from "vitest";

import { directUrlFromProxied } from "@/maps/api/cache";

describe("directUrlFromProxied", () => {
    it("reconstructs an Overpass GET (data folded into the url param)", () => {
        const query = "[out:json][timeout:240];node(1);out center;";
        const proxied = `/api/proxy-api?url=${encodeURIComponent(
            "https://overpass.kumi.systems/api/interpreter",
        )}?data=${encodeURIComponent(query)}`;
        const direct = directUrlFromProxied(proxied);
        expect(direct).not.toBeNull();
        const u = new URL(direct!);
        expect(u.origin + u.pathname).toBe(
            "https://overpass.kumi.systems/api/interpreter",
        );
        expect(u.searchParams.get("data")).toBe(query);
    });

    it("reconstructs a Nominatim lookup (appended path + sibling params)", () => {
        // fetchNominatimBoundary builds `${NOMINATIM_API}/lookup?osm_ids=..&..`
        // where NOMINATIM_API is already proxied — the path and first param
        // fold into the url param's value; the rest become siblings.
        const proxied =
            `/api/proxy-api?url=${encodeURIComponent(
                "https://nominatim.openstreetmap.org",
            )}/lookup` + `?osm_ids=R405155&polygon_geojson=1&format=json`;
        const direct = directUrlFromProxied(proxied);
        expect(direct).not.toBeNull();
        const u = new URL(direct!);
        expect(u.origin + u.pathname).toBe(
            "https://nominatim.openstreetmap.org/lookup",
        );
        expect(u.searchParams.get("osm_ids")).toBe("R405155");
        expect(u.searchParams.get("polygon_geojson")).toBe("1");
        expect(u.searchParams.get("format")).toBe("json");
        // The proxy's own routing param must never reach the upstream.
        expect(u.searchParams.has("url")).toBe(false);
    });

    it("reconstructs a Photon geocode URL", () => {
        const proxied =
            `/api/proxy-api?url=${encodeURIComponent(
                "https://photon.komoot.io/api/",
            )}` + `?lang=en&q=Hartford`;
        const direct = directUrlFromProxied(proxied);
        expect(direct).not.toBeNull();
        const u = new URL(direct!);
        expect(u.origin + u.pathname).toBe("https://photon.komoot.io/api/");
        expect(u.searchParams.get("lang")).toBe("en");
        expect(u.searchParams.get("q")).toBe("Hartford");
    });

    it("returns null for non-proxied URLs (dev mode, POST bases, relative paths)", () => {
        expect(
            directUrlFromProxied(
                "https://overpass.kumi.systems/api/interpreter?data=x",
            ),
        ).toBeNull();
        expect(directUrlFromProxied("/api/some-other-route?url=x")).toBeNull();
    });

    it("returns null when the url param is missing or not http(s)", () => {
        expect(directUrlFromProxied("/api/proxy-api")).toBeNull();
        expect(directUrlFromProxied("/api/proxy-api?url=not-a-url")).toBeNull();
        expect(
            directUrlFromProxied(
                `/api/proxy-api?url=${encodeURIComponent("file:///etc/passwd")}`,
            ),
        ).toBeNull();
    });
});
