import * as turf from "@turf/turf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hiderMode } from "@/lib/context";
import { arcBuffer, modifyMapData } from "@/maps/geo-utils";

import {
    adjustPerRadius,
    hiderifyRadius,
    radiusPlanningPolygon,
} from "./radius";

vi.mock("@/maps/geo-utils", async () => {
    const actual = await vi.importActual<typeof import("@/maps/geo-utils")>(
        "@/maps/geo-utils",
    );
    return {
        ...actual,
        arcBuffer: vi.fn(),
        modifyMapData: vi.fn(),
    };
});

afterEach(() => {
    hiderMode.set(false);
    vi.clearAllMocks();
});

describe("adjustPerRadius", () => {
    it("intersects mapData with the radius circle when within is true", async () => {
        const question: any = {
            lat: 35,
            lng: 139,
            radius: 1000,
            unit: "meters",
            within: true,
            drag: true,
            color: "red",
            collapsed: false,
        };
        const mapData = turf.featureCollection([
            turf.polygon([
                [
                    [138, 34],
                    [140, 34],
                    [140, 36],
                    [138, 36],
                    [138, 34],
                ],
            ]),
        ]);
        const mockCircle = turf.multiPolygon([
            [
                [
                    [138.9, 34.9],
                    [139.1, 34.9],
                    [139.1, 35.1],
                    [138.9, 35.1],
                    [138.9, 34.9],
                ],
            ],
        ]);
        (arcBuffer as any).mockResolvedValue(mockCircle);
        (modifyMapData as any).mockReturnValue(mockCircle);

        const result = await adjustPerRadius(question, mapData);

        expect(arcBuffer).toHaveBeenCalledTimes(1);
        expect(modifyMapData).toHaveBeenCalledWith(
            mapData,
            mockCircle,
            true,
        );
        expect(result).toBe(mockCircle);
    });

    it("subtracts the radius circle from mapData when within is false", async () => {
        const question: any = {
            lat: 35,
            lng: 139,
            radius: 1000,
            unit: "meters",
            within: false,
        };
        const mapData = turf.featureCollection([
            turf.polygon([
                [
                    [138, 34],
                    [140, 34],
                    [140, 36],
                    [138, 36],
                    [138, 34],
                ],
            ]),
        ]);
        const mockCircle = turf.multiPolygon([
            [
                [
                    [138.9, 34.9],
                    [139.1, 34.9],
                    [139.1, 35.1],
                    [138.9, 35.1],
                    [138.9, 34.9],
                ],
            ],
        ]);
        const mockSubtraction = turf.multiPolygon([
            [
                [
                    [138, 34],
                    [140, 34],
                    [140, 36],
                    [138, 36],
                    [138, 34],
                ],
            ],
        ]);
        (arcBuffer as any).mockResolvedValue(mockCircle);
        (modifyMapData as any).mockReturnValue(mockSubtraction);

        const result = await adjustPerRadius(question, mapData);

        expect(modifyMapData).toHaveBeenCalledWith(
            mapData,
            mockCircle,
            false,
        );
        expect(result).toBe(mockSubtraction);
    });

    it("returns undefined when mapData is null", async () => {
        const question: any = {
            lat: 35,
            lng: 139,
            radius: 1000,
            unit: "meters",
            within: true,
        };

        const result = await adjustPerRadius(question, null);

        expect(result).toBeUndefined();
        expect(arcBuffer).not.toHaveBeenCalled();
        expect(modifyMapData).not.toHaveBeenCalled();
    });
});

describe("hiderifyRadius", () => {
    it("sets question.within = true when hider is inside radius", () => {
        const question: any = {
            lat: 35,
            lng: 139,
            radius: 1000,
            unit: "meters",
            within: undefined,
        };
        hiderMode.set({ latitude: 35.001, longitude: 139.001 });

        const result = hiderifyRadius(question);

        expect(result.within).toBe(true);
    });

    it("sets question.within = false when hider is outside radius", () => {
        const question: any = {
            lat: 35,
            lng: 139,
            radius: 1000,
            unit: "meters",
            within: undefined,
        };
        hiderMode.set({ latitude: 36, longitude: 140 });

        const result = hiderifyRadius(question);

        expect(result.within).toBe(false);
    });

    it("returns question unchanged when hiderMode is false", () => {
        const question: any = {
            lat: 35,
            lng: 139,
            radius: 1000,
            unit: "meters",
            within: true,
        };
        hiderMode.set(false);

        const result = hiderifyRadius(question);

        expect(result).toBe(question);
        expect(result.within).toBe(true);
    });
});

describe("radiusPlanningPolygon", () => {
    it("returns the line boundary of the radius circle", async () => {
        const question: any = {
            lat: 35,
            lng: 139,
            radius: 1000,
            unit: "meters",
        };
        const mockCircle = turf.polygon([
            [
                [138.9, 34.9],
                [139.1, 34.9],
                [139.1, 35.1],
                [138.9, 35.1],
                [138.9, 34.9],
            ],
        ]);
        (arcBuffer as any).mockResolvedValue(mockCircle);

        const result = await radiusPlanningPolygon(question);

        expect(result).toBeDefined();
        expect(result!.type).toBe("Feature");
        const geomType = result!.geometry!.type;
        expect(["LineString", "MultiLineString"]).toContain(geomType);
    });
});
