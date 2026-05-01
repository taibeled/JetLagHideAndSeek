import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";

import {
    CONSULATE_NEARBY_MERGE_THRESHOLD_M,
    mergeNearbyPoiPoints,
    mergeNearbyPoiPointsForLocation,
} from "./poi-proximity-merge";

function names(fc: ReturnType<typeof mergeNearbyPoiPoints>): string[] {
    return fc.features
        .map((f) => f.properties?.name)
        .filter((x): x is string => typeof x === "string")
        .sort((a, b) => a.localeCompare(b));
}

describe("mergeNearbyPoiPoints", () => {
    it("does not merge Uruguay/Costa Rica-like pair below threshold", () => {
        const base = turf.point([139.7220331, 35.6591871], {
            name: "Embassy of Uruguay",
        });
        const costaRica = turf.destination(base, 11.25, 90, {
            units: "meters",
            properties: { name: "Embassy of Costa Rica" },
        });
        const far = turf.destination(base, 240, 90, {
            units: "meters",
            properties: { name: "Embassy of Romania" },
        });
        const points = turf.featureCollection([base, costaRica, far]);

        const merged = mergeNearbyPoiPoints(points, 11);
        expect(merged.features).toHaveLength(3);
        expect(names(merged)).toEqual([
            "Embassy of Costa Rica",
            "Embassy of Romania",
            "Embassy of Uruguay",
        ]);
    });

    it("merges Uruguay/Costa Rica-like pair at the recommended threshold", () => {
        const base = turf.point([139.7220331, 35.6591871], {
            name: "Embassy of Uruguay",
        });
        const costaRica = turf.destination(base, 11.25, 90, {
            units: "meters",
            properties: { name: "Embassy of Costa Rica" },
        });
        const far = turf.destination(base, 240, 90, {
            units: "meters",
            properties: { name: "Embassy of Romania" },
        });
        const points = turf.featureCollection([base, costaRica, far]);

        const merged = mergeNearbyPoiPoints(
            points,
            CONSULATE_NEARBY_MERGE_THRESHOLD_M,
        );
        expect(merged.features).toHaveLength(2);
        const pair = merged.features.find(
            (f) => (f.properties?.memberCount as number) === 2,
        );
        expect(pair).toBeDefined();
        expect(pair?.properties?.memberNames).toEqual([
            "Embassy of Costa Rica",
            "Embassy of Uruguay",
        ]);
    });

    it("captures transitive chain growth when threshold increases", () => {
        const a = turf.point([139.72, 35.66], { name: "A" });
        const b = turf.destination(a, 11.5, 90, {
            units: "meters",
            properties: { name: "B" },
        });
        const c = turf.destination(b, 12.2, 90, {
            units: "meters",
            properties: { name: "C" },
        });
        const points = turf.featureCollection([a, b, c]);

        const conservative = mergeNearbyPoiPoints(points, 12);
        expect(conservative.features).toHaveLength(2);

        const aggressive = mergeNearbyPoiPoints(points, 12.3);
        expect(aggressive.features).toHaveLength(1);
        expect(aggressive.features[0].properties?.memberCount).toBe(3);
    });
});

describe("mergeNearbyPoiPointsForLocation", () => {
    it("only applies automatic clustering for consulate", () => {
        const a = turf.point([0, 0], { name: "A" });
        const b = turf.destination(a, 8, 90, {
            units: "meters",
            properties: { name: "B" },
        });
        const points = turf.featureCollection([a, b]);

        const forPark = mergeNearbyPoiPointsForLocation(points, "park");
        const forConsulate = mergeNearbyPoiPointsForLocation(
            points,
            "consulate",
        );

        expect(forPark.features).toHaveLength(2);
        expect(forConsulate.features).toHaveLength(1);
    });
});
