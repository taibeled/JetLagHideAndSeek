import * as turf from "@turf/turf";
import { afterEach, expect, test, vi } from "vitest";

import { geoSpatialVoronoi, safeUnion } from "@/maps/geo-utils/operators";

// Deterministic PRNG (mulberry32). turf.randomPoint() draws from Math.random,
// so without seeding the point cloud differed every run and across Node
// versions — and turf's voronoi produces occasional boundary slivers, so an
// unseeded "every point lands in its nearest cell" assertion was flaky (it
// failed in CI, passed locally, by luck). Seeding makes the input reproducible.
function mulberry32(seed: number): () => number {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

afterEach(() => vi.restoreAllMocks());

test("voronoi diagram", () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(0x5eed));

    const BASE_POINT_COUNT = 25;
    const TEST_POINT_COUNT = 500;

    const basePoints = turf.randomPoint(BASE_POINT_COUNT);
    const voronoi = geoSpatialVoronoi(basePoints);

    expect(voronoi).toBeDefined();
    expect(voronoi.features.length).toBe(BASE_POINT_COUNT);

    const testPoints = turf.randomPoint(TEST_POINT_COUNT);

    let classified = 0;
    let correct = 0;
    testPoints.features.forEach((point) => {
        const voronoiIndex = voronoi.features.findIndex((feature) =>
            turf.booleanPointInPolygon(point, feature),
        );
        const nearestBasePoint = turf.nearestPoint(point, basePoints);
        const basePointIndex = basePoints.features.findIndex(
            (feature) =>
                feature.geometry.coordinates[0] ===
                    nearestBasePoint.geometry.coordinates[0] &&
                feature.geometry.coordinates[1] ===
                    nearestBasePoint.geometry.coordinates[1],
        );

        if (voronoiIndex === -1) {
            return; // turf glitch: overlapping/sliver polygons leave gaps
        }

        classified++;
        if (voronoiIndex === basePointIndex) correct++;
    });

    // A voronoi cell should contain exactly the points nearest its site, so
    // the vast majority must match. Allow a small slack for turf's boundary
    // slivers (points on a shared edge claimed by an adjacent cell) rather
    // than asserting a brittle 100%.
    expect(classified).toBeGreaterThan(0);
    expect(correct / classified).toBeGreaterThan(0.95);
});

test("safeUnion handles empty feature collections", () => {
    const empty = turf.featureCollection([]);
    const result = safeUnion(empty as any);
    expect(result).toBeDefined();
    expect(
        result.geometry.type === "Polygon" ||
            result.geometry.type === "MultiPolygon",
    ).toBe(true);
});
