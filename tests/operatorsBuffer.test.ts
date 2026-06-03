import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";

import { arcBuffer, arcBufferToPoint } from "@/maps/geo-utils/operators";

// These lock in the turf-based replacements for the former @arcgis/core
// geodesic buffer / distance operators (removed to drop a 1.2 MB chunk).
describe("geodesic operators (turf)", () => {
    it("arcBuffer draws a ~radius geodesic circle around a point", async () => {
        const center: [number, number] = [-73.9, 40.7];
        const fc = turf.featureCollection([turf.point(center)]);
        const out = await arcBuffer(fc, 5, "miles");

        expect(out.geometry.type).toBe("MultiPolygon");
        const ring = out.geometry.coordinates[0][0];
        const dists = ring.map((c) =>
            turf.distance(center, c as [number, number], { units: "miles" }),
        );
        const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
        // Within ~0.3% of nominal radius (sphere-vs-ellipsoid offset).
        expect(mean).toBeGreaterThan(4.97);
        expect(mean).toBeLessThan(5.03);
    });

    it("arcBuffer unions multiple point buffers into one MultiPolygon", async () => {
        const fc = turf.featureCollection([
            turf.point([-73.99, 40.75]),
            turf.point([-73.97, 40.76]),
        ]);
        const out = await arcBuffer(fc, 1, "miles");
        expect(["Polygon", "MultiPolygon"]).toContain(out.geometry.type);
        expect(turf.area(out)).toBeGreaterThan(0);
    });

    it("arcBufferToPoint buffers geometry by its nearest distance to the point", async () => {
        const poly = turf.polygon([
            [
                [-74, 40.6],
                [-73.9, 40.6],
                [-73.9, 40.7],
                [-74, 40.7],
                [-74, 40.6],
            ],
        ]);
        const fc = turf.featureCollection([poly]);
        // Point east of the polygon.
        const out = await arcBufferToPoint(fc, 40.65, -73.8);
        expect(["Polygon", "MultiPolygon"]).toContain(out.geometry.type);
        // Buffering outward by the point's own distance grows the polygon and
        // reaches ~to the point.
        expect(turf.area(out)).toBeGreaterThan(turf.area(poly));
        const grown = turf.buffer(out, 0.05, { units: "miles" })!;
        expect(turf.booleanPointInPolygon([-73.8, 40.65], grown)).toBe(true);
    });
});
