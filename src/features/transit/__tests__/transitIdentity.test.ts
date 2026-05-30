import {
    createGtfsRouteId,
    createGtfsStopId,
    createOsmElementId,
    isCanonicalTransitRouteId,
    isCanonicalTransitStationId,
} from "../transitIdentity";

describe("transit identity", () => {
    it("creates canonical GTFS route and stop ids", () => {
        expect(createGtfsRouteId("odpt-tokyo-metro", "3")).toBe(
            "gtfs:odpt-tokyo-metro:route:3",
        );
        expect(createGtfsStopId("odpt-tokyo-metro", "303")).toBe(
            "gtfs:odpt-tokyo-metro:stop:303",
        );
    });

    it("encodes native GTFS identity segments", () => {
        expect(createGtfsRouteId("feed:one", "Line A/B")).toBe(
            "gtfs:feed%3Aone:route:Line%20A%2FB",
        );
    });

    it("creates reserved OSM element ids", () => {
        expect(createOsmElementId("relation", 12345678)).toBe(
            "osm:relation:12345678",
        );
        expect(createOsmElementId("node", "23456789")).toBe(
            "osm:node:23456789",
        );
        expect(createOsmElementId("way", 34567890)).toBe("osm:way:34567890");
    });

    it("recognizes route and station ids without accepting legacy ids", () => {
        expect(isCanonicalTransitRouteId("gtfs:odpt-toei-subway:route:3")).toBe(
            true,
        );
        expect(isCanonicalTransitRouteId("osm:relation:12345678")).toBe(true);
        expect(isCanonicalTransitRouteId("tokyo-metro:3")).toBe(false);
        expect(
            isCanonicalTransitStationId("gtfs:odpt-toei-subway:stop:3"),
        ).toBe(true);
        expect(isCanonicalTransitStationId("osm:node:23456789")).toBe(true);
    });
});
