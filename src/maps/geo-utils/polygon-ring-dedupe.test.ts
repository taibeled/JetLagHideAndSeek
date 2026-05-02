import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { describe, expect, it } from "vitest";

import { assertPolygonalFeatureHasCleanRings } from "../../../tests/leafletPolygonAssertions";
import {
    dedupeConsecutiveRingPositions,
    dedupePolygonFeatureVertices,
} from "./polygon-ring-dedupe";

describe("dedupeConsecutiveRingPositions", () => {
    it("collapses runs of identical positions in a closed ring", () => {
        const ring = dedupeConsecutiveRingPositions([
            [0, 0],
            [1, 0],
            [1, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
        ]);
        for (let i = 1; i < ring.length; i++) {
            expect(
                ring[i - 1][0] === ring[i][0] &&
                    ring[i - 1][1] === ring[i][1],
            ).toBe(false);
        }
        expect(ring[0]).toEqual(ring[ring.length - 1]);
    });

    it("removes non-consecutive repeated vertices within the same ring", () => {
        const ring = dedupeConsecutiveRingPositions([
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [1, 0], // repeated non-consecutively
            [0, 0],
        ]);
        for (let i = 1; i < ring.length; i++) {
            expect(
                ring[i - 1][0] === ring[i][0] &&
                    ring[i - 1][1] === ring[i][1],
            ).toBe(false);
        }
        const body = ring.slice(0, -1).map((p) => `${p[0]},${p[1]}`);
        expect(new Set(body).size).toBe(body.length);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
    });
});

describe("dedupePolygonFeatureVertices", () => {
    it("produces Leaflet-safe Polygon rings after truncate + dedupe", () => {
        const poly = turf.polygon([
            [
                [139.72, 35.66],
                [139.74, 35.66],
                [139.74, 35.66],
                [139.76, 35.68],
                [139.72, 35.7],
                [139.72, 35.66],
            ],
        ]);
        const out = dedupePolygonFeatureVertices(poly as Feature<Polygon>);
        assertPolygonalFeatureHasCleanRings(out);
    });

    it("cleans every ring of a MultiPolygon", () => {
        const mp = turf.multiPolygon([
            [
                [
                    [-1, -1],
                    [2, -1],
                    [2, -1],
                    [2, 2],
                    [-1, 2],
                    [-1, -1],
                ],
            ],
            [
                [
                    [5, 5],
                    [8, 5],
                    [8, 8],
                    [8, 8],
                    [5, 8],
                    [5, 5],
                ],
            ],
        ]);
        const out = dedupePolygonFeatureVertices(mp as Feature<MultiPolygon>);
        assertPolygonalFeatureHasCleanRings(out);
    });
});
