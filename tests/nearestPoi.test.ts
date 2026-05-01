import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";

import {
    formatDistance,
    measuringNearestPoiCategory,
    nearestLineDistance,
    nearestNamedPoint,
    pointDisplayName,
    resolveMatchingNearestPoi,
    resolveMeasuringNearestPoi,
} from "@/lib/nearestPoi";

describe("nearest POI display helpers", () => {
    it("selects the nearest named point", () => {
        const points = turf.featureCollection([
            turf.point([139.7, 35.7], { name: "Far Place" }),
            turf.point([139.75, 35.75], { name: "Near Place" }),
        ]);

        expect(nearestNamedPoint(35.751, 139.751, points)).toBe("Near Place");
    });

    it("falls back to coordinates for unnamed points", () => {
        expect(pointDisplayName(turf.point([139.75, 35.75]))).toBe(
            "35.75°N, 139.75°E",
        );
    });

    it("resolves custom matching point names", async () => {
        const result = await resolveMatchingNearestPoi({
            type: "custom-points",
            lat: 35.751,
            lng: 139.751,
            same: true,
            drag: true,
            color: "blue",
            collapsed: false,
            geo: [
                turf.point([139.7, 35.7], { name: "Far Custom" }),
                turf.point([139.75, 35.75], { name: "Near Custom" }),
            ],
        });

        expect(result).toEqual({
            status: "found",
            category: "custom point",
            name: "Near Custom",
        });
        expect("distance" in result).toBe(false);
    });

    it("resolves custom measuring point names with distance", async () => {
        const result = await resolveMeasuringNearestPoi(
            {
                type: "custom-measure",
                lat: 35.751,
                lng: 139.751,
                hiderCloser: true,
                drag: true,
                color: "blue",
                collapsed: false,
                geo: turf.featureCollection([
                    turf.point([139.7, 35.7], { name: "Far Measure" }),
                    turf.point([139.75, 35.75], { name: "Near Measure" }),
                ]),
            },
            [],
            "kilometers",
        );

        expect(result.status).toBe("found");
        if (result.status !== "found") throw new Error("Expected found result");
        expect(result.category).toBe("custom point");
        expect(result.name).toBe("Near Measure");
        expect(result.distance?.unit).toBe("kilometers");
        expect(result.distance?.label).toBe("km");
        expect(result.distance?.text).toBe(
            formatDistance(
                turf.distance(
                    turf.point([139.751, 35.751]),
                    turf.point([139.75, 35.75]),
                    { units: "kilometers" },
                ),
                "kilometers",
            ),
        );
    });

    it("uses station labels for station-based measuring", async () => {
        const result = await resolveMeasuringNearestPoi(
            {
                type: "rail-measure",
                lat: 35.751,
                lng: 139.751,
                hiderCloser: true,
                drag: true,
                color: "blue",
                collapsed: false,
            },
            [
                turf.point([139.7, 35.7], { name: "Far Station", id: "1" }),
                turf.point([139.75, 35.75], {
                    "name:en": "Near Station",
                    id: "2",
                }),
            ],
        );

        expect(result.status).toBe("found");
        if (result.status !== "found") throw new Error("Expected found result");
        expect(result.category).toBe("station");
        expect(result.name).toBe("Near Station");
        expect(result.distance?.unit).toBe("miles");
        expect(result.distance?.text).toBe(
            formatDistance(
                turf.distance(
                    turf.point([139.751, 35.751]),
                    turf.point([139.75, 35.75]),
                    { units: "miles" },
                ),
                "miles",
            ),
        );
    });

    it("formats distances for app units", () => {
        expect(formatDistance(0.1234, "miles")).toBe("0.12 mi");
        expect(formatDistance(12.34, "kilometers")).toBe("12.3 km");
        expect(formatDistance(123.4, "meters")).toBe("123 m");
    });

    it("computes nearest line distance for high-speed rail style geometry", () => {
        const distance = nearestLineDistance(
            0.1,
            0.5,
            [
                turf.lineString([
                    [0, 0],
                    [1, 0],
                ]),
                turf.lineString([
                    [10, 10],
                    [11, 11],
                ]),
            ],
            "kilometers",
        );

        expect(distance?.unit).toBe("kilometers");
        expect(distance?.label).toBe("km");
        expect(distance?.value).toBeGreaterThan(11);
        expect(distance?.value).toBeLessThan(12);
    });

    it("returns no nearest line distance for empty or non-line geometry", () => {
        expect(nearestLineDistance(0, 0, [], "miles")).toBeNull();
        expect(
            nearestLineDistance(0, 0, [turf.point([0, 0])], "miles"),
        ).toBeNull();
    });

    it("categorizes high-speed rail measuring as distance-supported", () => {
        expect(
            measuringNearestPoiCategory("highspeed-measure-shinkansen"),
        ).toBe("high-speed rail");
    });

    it("returns unsupported for non-POI measuring types", async () => {
        await expect(
            resolveMeasuringNearestPoi({
                type: "coastline",
                lat: 35.751,
                lng: 139.751,
                hiderCloser: true,
                drag: true,
                color: "blue",
                collapsed: false,
            }),
        ).resolves.toEqual({ status: "unsupported" });
    });
});
