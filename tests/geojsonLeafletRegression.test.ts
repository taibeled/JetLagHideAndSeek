import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";
import { describe, expect, it } from "vitest";

import {
    clippedVoronoiCells,
    holedMask,
    modifyMapData,
    safeUnion,
    sanitizeGeoJSONForLeaflet,
} from "@/maps/geo-utils/operators";

import { assertPolygonalFeatureHasCleanRings } from "./leafletPolygonAssertions";

describe("sanitizeGeoJSONForLeaflet (Leaflet duplicate-vertex regression)", () => {
    it("returns null for null/undefined input", () => {
        expect(sanitizeGeoJSONForLeaflet(null)).toBeNull();
        expect(sanitizeGeoJSONForLeaflet(undefined)).toBeNull();
    });

    it("strips consecutive duplicates from polygon features in a FeatureCollection", () => {
        const dup = turf.polygon([
            [
                [-50.2, -10.1],
                [-50.1, -10.1],
                [-50.1, -10.0],
                [-50.1, -10.0],
                [-50.2, -10.0],
                [-50.2, -10.1],
            ],
        ]);
        const fc = turf.featureCollection([
            dup,
            turf.point([-50.15, -10.05], { id: 1 }),
        ]);
        const ringBefore = dup.geometry.coordinates[0];
        expect(
            ringBefore[2][0] === ringBefore[3][0] &&
                ringBefore[2][1] === ringBefore[3][1],
        ).toBe(true);

        const out = sanitizeGeoJSONForLeaflet(fc as FeatureCollection);
        expect(out?.type).toBe("FeatureCollection");
        const feats = (out as FeatureCollection).features;
        assertPolygonalFeatureHasCleanRings(
            feats[0] as Feature<Polygon | MultiPolygon>,
        );
        expect(feats[1].geometry?.type).toBe("Point");
    });

    it("cleans a single Polygon Feature", () => {
        const dup = turf.polygon([
            [
                [10, 10],
                [11, 10],
                [11, 11],
                [11, 11],
                [10, 11],
                [10, 10],
            ],
        ]);
        const out = sanitizeGeoJSONForLeaflet(dup as Feature);
        assertPolygonalFeatureHasCleanRings(out as Feature<Polygon>);
    });

    it("passes through non-polygon features unchanged", () => {
        const ls = turf.lineString([
            [0, 0],
            [1, 1],
        ]);
        const out = sanitizeGeoJSONForLeaflet(ls as Feature);
        expect(out).toEqual(ls);
    });

    it("cleans every ring of a MultiPolygon (including duplicate runs mid-ring)", () => {
        const mp = turf.multiPolygon([
            [
                [
                    [0, 0],
                    [2, 0],
                    [2, 0],
                    [2, 2],
                    [0, 2],
                    [0, 0],
                ],
            ],
            [
                [
                    [4, 4],
                    [6, 4],
                    [6, 6],
                    [6, 6],
                    [4, 6],
                    [4, 4],
                ],
            ],
        ]);
        const out = sanitizeGeoJSONForLeaflet(mp as Feature);
        assertPolygonalFeatureHasCleanRings(out as Feature<MultiPolygon>);
    });

    /** Tokyo-scale coords: elimination-layer GeoJSON must stay Leaflet-valid on real bounding boxes. */
    it("cleans consecutive duplicate vertices along a long urban edge (CAS / Overpass scale)", () => {
        const poly = turf.polygon([
            [
                [139.5628986, 35.8174937],
                [139.9189004, 35.8174937],
                [139.9189004, 35.8174937],
                [139.9189004, 35.4816556],
                [139.5628986, 35.4816556],
                [139.5628986, 35.8174937],
            ],
        ]);
        const out = sanitizeGeoJSONForLeaflet(poly as Feature);
        assertPolygonalFeatureHasCleanRings(out as Feature<Polygon>);
    });
});

describe("safeUnion strips consecutive duplicate vertices", () => {
    it("cleans a single-feature FeatureCollection", () => {
        const f = turf.polygon([
            [
                [-122.41, 37.75],
                [-122.4, 37.75],
                [-122.4, 37.76],
                [-122.4, 37.76],
                [-122.41, 37.76],
                [-122.41, 37.75],
            ],
        ]);
        const u = safeUnion(turf.featureCollection([f]));
        assertPolygonalFeatureHasCleanRings(u as Feature<Polygon>);
    });

    it("cleans turf.union MultiPolygon output (disjoint inputs)", () => {
        const a = turf.polygon([
            [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
            ],
        ]);
        const b = turf.polygon([
            [
                [3, 0],
                [4, 0],
                [4, 1],
                [3, 1],
                [3, 0],
            ],
        ]);
        const u = safeUnion(turf.featureCollection([a, b]));
        expect(u.geometry.type).toBe("MultiPolygon");
        assertPolygonalFeatureHasCleanRings(u as Feature<MultiPolygon>);
    });
});

describe("modifyMapData strips consecutive duplicate vertices (boolean pipeline)", () => {
    it("returns intersected geometry without consecutive duplicate ring vertices (within=true)", () => {
        const outer = turf.polygon([
            [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
            ],
        ]);
        const rect = turf.polygon([
            [
                [2, 2],
                [8, 2],
                [8, 8],
                [2, 8],
                [2, 2],
            ],
        ]);
        const mapFc = turf.featureCollection([outer]);
        const modFc = turf.featureCollection([rect]);
        const result = modifyMapData(mapFc, modFc, true);
        expect(result).not.toBeNull();
        assertPolygonalFeatureHasCleanRings(
            result as Feature<Polygon | MultiPolygon>,
        );
    });

    it("returns intersected geometry without consecutive duplicate ring vertices (within=false)", () => {
        const zone = turf.polygon([
            [
                [140.0, 35.0],
                [140.2, 35.0],
                [140.2, 35.2],
                [140.0, 35.2],
                [140.0, 35.0],
            ],
        ]);
        const exclusion = turf.polygon([
            [
                [140.05, 35.05],
                [140.15, 35.05],
                [140.15, 35.15],
                [140.05, 35.15],
                [140.05, 35.05],
            ],
        ]);
        const result = modifyMapData(
            turf.featureCollection([zone]),
            exclusion,
            false,
        );
        expect(result).not.toBeNull();
        assertPolygonalFeatureHasCleanRings(
            result as Feature<Polygon | MultiPolygon>,
        );
    });
});

describe("holedMask output is safe for Leaflet rings", () => {
    it("produces polygonal geometry without consecutive duplicate vertices", () => {
        const hole = turf.polygon([
            [
                [-1, -1],
                [1, -1],
                [1, 1],
                [-1, 1],
                [-1, -1],
            ],
        ]);
        const masked = holedMask(hole);
        expect(masked).not.toBeNull();
        assertPolygonalFeatureHasCleanRings(
            masked as Feature<Polygon | MultiPolygon>,
        );
    });
});

describe("clippedVoronoiCells output is safe for Leaflet rings", () => {
    it("every cell ring has no consecutive duplicate vertices", () => {
        const clipA = turf.polygon([
            [
                [-122.5, 37.7],
                [-122.3, 37.7],
                [-122.5, 37.85],
                [-122.5, 37.7],
            ],
        ]);
        const points = turf.featureCollection([
            turf.point([-122.45, 37.76], { name: "L" }),
            turf.point([-122.34, 37.82], { name: "R" }),
        ]);
        const cells = clippedVoronoiCells(points, clipA);
        expect(cells.length).toBeGreaterThan(0);
        for (const cell of cells) {
            assertPolygonalFeatureHasCleanRings(cell);
        }
    });
});
