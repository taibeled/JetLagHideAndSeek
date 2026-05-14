import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import { describe, expect, it } from "vitest";

import { deriveLandmassComponents } from "@/maps/api/overpass";

type PolyFeature = Feature<Polygon | MultiPolygon>;

describe("deriveLandmassComponents", () => {
    it("splits connected territory into distinct landmasses by water polygons", () => {
        const territory = turf.polygon([
            [
                [-74.03, 40.67],
                [-73.84, 40.67],
                [-73.84, 40.9],
                [-74.03, 40.9],
                [-74.03, 40.67],
            ],
        ]) as PolyFeature;

        // Two north/south water channels, making three land components
        // (west/mainland-ish, center/manhattan-ish, east/roosevelt-ish).
        const westChannel = turf.polygon([
            [
                [-73.99, 40.67],
                [-73.975, 40.67],
                [-73.975, 40.9],
                [-73.99, 40.9],
                [-73.99, 40.67],
            ],
        ]) as PolyFeature;
        const eastChannel = turf.polygon([
            [
                [-73.955, 40.67],
                [-73.945, 40.67],
                [-73.945, 40.9],
                [-73.955, 40.9],
                [-73.955, 40.67],
            ],
        ]) as PolyFeature;

        const parts = deriveLandmassComponents(territory, [
            westChannel,
            eastChannel,
        ]);

        expect(parts.length).toBe(3);

        const ptMainland = turf.point([-74.01, 40.78]);
        const ptManhattan = turf.point([-73.968, 40.78]);
        const ptRoosevelt = turf.point([-73.94, 40.78]);

        const containingIdx = (pt: Feature<Point>) =>
            parts.findIndex((p) => turf.booleanPointInPolygon(pt, p));

        const iMain = containingIdx(ptMainland);
        const iMan = containingIdx(ptManhattan);
        const iRoo = containingIdx(ptRoosevelt);

        expect(iMain).toBeGreaterThanOrEqual(0);
        expect(iMan).toBeGreaterThanOrEqual(0);
        expect(iRoo).toBeGreaterThanOrEqual(0);
        expect(new Set([iMain, iMan, iRoo]).size).toBe(3);
    });

    it("also splits landmasses when separators are water lines (not polygons)", () => {
        const territory = turf.polygon([
            [
                [-74.03, 40.67],
                [-73.84, 40.67],
                [-73.84, 40.9],
                [-74.03, 40.9],
                [-74.03, 40.67],
            ],
        ]) as PolyFeature;

        const westChannelLine = turf.lineString([
            [-73.982, 40.67],
            [-73.982, 40.9],
        ]);
        const eastChannelLine = turf.lineString([
            [-73.95, 40.67],
            [-73.95, 40.9],
        ]);

        const parts = deriveLandmassComponents(
            territory,
            [],
            [westChannelLine as any, eastChannelLine as any],
        );
        expect(parts.length).toBe(3);
    });
});
