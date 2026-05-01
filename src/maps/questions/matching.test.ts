import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";

import { pointInPolygonSafe } from "./matching";

describe("pointInPolygonSafe", () => {
    it("returns true for valid containing polygon", () => {
        const pt = turf.point([139.7, 35.7]);
        const poly = turf.polygon([
            [
                [139.6, 35.6],
                [139.8, 35.6],
                [139.8, 35.8],
                [139.6, 35.8],
                [139.6, 35.6],
            ],
        ]);
        expect(pointInPolygonSafe(pt, poly)).toBe(true);
    });

    it("returns false when point lies outside", () => {
        const pt = turf.point([3, 3]);
        const poly = turf.polygon([
            [
                [-1, -1],
                [1, -1],
                [1, 1],
                [-1, 1],
                [-1, -1],
            ],
        ]);
        expect(pointInPolygonSafe(pt, poly)).toBe(false);
    });
});
