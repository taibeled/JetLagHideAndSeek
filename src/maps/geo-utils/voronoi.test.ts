import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { describe, expect, it } from "vitest";

import { assertPolygonalFeatureHasCleanRings } from "../../../tests/leafletPolygonAssertions";

import {
    clippedVoronoiCells,
    finalizePolygonForLeaflet,
    repairIntersectedCell,
} from "./voronoi";

describe("clippedVoronoiCells", () => {
    it("does not reuse cached cells when clips differ but share bbox", () => {
        const clipA = turf.polygon([
            [
                [-122.5, 37.7],
                [-122.3, 37.7],
                [-122.5, 37.85],
                [-122.5, 37.7],
            ],
        ]);
        const clipB = turf.polygon([
            [
                [-122.3, 37.7],
                [-122.3, 37.85],
                [-122.5, 37.85],
                [-122.3, 37.7],
            ],
        ]);

        expect(turf.bbox(clipA).join(",")).toBe(turf.bbox(clipB).join(","));

        const points = turf.featureCollection([
            turf.point([-122.45, 37.76], { name: "L" }),
            turf.point([-122.34, 37.82], { name: "R" }),
        ]);

        const cellsA = clippedVoronoiCells(points, clipA);
        const cellsB = clippedVoronoiCells(points, clipB);

        expect(cellsA.length).toBeGreaterThan(0);
        expect(cellsB.length).toBeGreaterThan(0);

        const areasA = cellsA.map((c) => turf.area(c)).sort((a, b) => a - b);
        const areasB = cellsB.map((c) => turf.area(c)).sort((a, b) => a - b);
        expect(areasA).not.toEqual(areasB);
    });

    /**
     * Regression: many POIs in a dense urban bbox (e.g. diplomatic offices in Tokyo 23-ku) stresses
     * d3 geo Voronoi + turf.intersect; bad rings used to throw inside react-leaflet GeoJSON and kill the map.
     */
    it("dense seed grid (Tokyo-scale lng/lat): returns Leaflet-clean rings and does not throw", () => {
        const clip = turf.polygon([
            [
                [139.62, 35.62],
                [139.82, 35.62],
                [139.82, 35.78],
                [139.62, 35.78],
                [139.62, 35.62],
            ],
        ]);

        const pts: ReturnType<typeof turf.point>[] = [];
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                pts.push(
                    turf.point(
                        [
                            139.62 + ((i + 0.5) / 8) * 0.2,
                            35.62 + ((j + 0.5) / 8) * 0.16,
                        ],
                        { name: `cell-${i}-${j}` },
                    ),
                );
            }
        }

        const fc = turf.featureCollection(pts);
        let cells: ReturnType<typeof clippedVoronoiCells> = [];
        expect(() => {
            cells = clippedVoronoiCells(fc, clip);
        }).not.toThrow();

        expect(cells.length).toBeGreaterThan(0);
        for (const cell of cells) {
            assertPolygonalFeatureHasCleanRings(cell);
            expect(turf.area(cell)).toBeGreaterThan(0);
            const p = turf.pointOnFeature(cell);
            expect(() =>
                turf.booleanPointInPolygon(p, cell as any),
            ).not.toThrow();
        }
    });

    /** Clip rings from OSM unions sometimes carry consecutive duplicate boundary vertices. */
    it("clip polygon with consecutive duplicate corner does not cause clippedVoronoiCells to throw", () => {
        const clipWithDupEdge = turf.polygon([
            [
                [139.62, 35.62],
                [139.75, 35.62],
                [139.75, 35.62],
                [139.82, 35.72],
                [139.62, 35.78],
                [139.62, 35.62],
            ],
        ]);
        const fc = turf.featureCollection([
            turf.point([139.66, 35.66], { name: "a" }),
            turf.point([139.78, 35.74], { name: "b" }),
            turf.point([139.7, 35.7], { name: "c" }),
        ]);

        expect(() => clippedVoronoiCells(fc, clipWithDupEdge)).not.toThrow();
        const cells = clippedVoronoiCells(fc, clipWithDupEdge);
        expect(cells.length).toBeGreaterThan(0);
        for (const cell of cells) {
            assertPolygonalFeatureHasCleanRings(cell);
        }
    });
});

describe("finalizePolygonForLeaflet", () => {
    it("removes consecutive duplicate vertices that break Leaflet GeoJSON", () => {
        const dup = turf.polygon([
            [
                [-122.41, 37.75],
                [-122.4, 37.75],
                [-122.4, 37.76],
                [-122.4, 37.76],
                [-122.41, 37.76],
                [-122.41, 37.75],
            ],
        ]);
        const out = finalizePolygonForLeaflet(dup);
        expect(out).not.toBeNull();
        const ring = (out!.geometry as Polygon).coordinates[0];
        for (let i = 1; i < ring.length; i++) {
            const a = ring[i - 1];
            const b = ring[i];
            expect(a[0] === b[0] && a[1] === b[1]).toBe(false);
        }
    });
});

describe("repairIntersectedCell", () => {
    it("unkinks self-intersecting rings and preserves properties", () => {
        const bowtie = turf.polygon([
            [
                [-122.4, 37.75],
                [-122.37, 37.77],
                [-122.37, 37.75],
                [-122.4, 37.77],
                [-122.4, 37.75],
            ],
        ]);
        bowtie.properties = { site: { properties: { name: "TestSite" } } };

        expect(turf.kinks(bowtie).features.length).toBeGreaterThan(0);

        const repaired = repairIntersectedCell(bowtie);
        expect(repaired).not.toBeNull();
        expect(turf.booleanValid(repaired!)).toBe(true);
        expect(turf.area(repaired!)).toBeGreaterThan(0);
        expect(
            (repaired!.properties as { site?: { properties?: { name?: string } } })
                ?.site?.properties?.name,
        ).toBe("TestSite");
    });

    it("does not throw when unkinkPolygon rejects non-consecutive duplicate vertices", () => {
        const repeatedVertex = turf.polygon([
            [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [1, 0], // repeated non-consecutively: unkinkPolygon throws on this
                [0, 0],
            ],
        ]);
        const feature = repeatedVertex as Feature<Polygon | MultiPolygon>;
        expect(() => repairIntersectedCell(feature)).not.toThrow();
        const repaired = repairIntersectedCell(
            feature,
        );
        // Either cleaned geometry or dropped cell is acceptable; crash is not.
        expect(repaired === null || turf.area(repaired) >= 0).toBe(true);
    });
});
