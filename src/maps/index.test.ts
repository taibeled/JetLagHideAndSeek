import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/maps/geo-utils", () => ({}));

vi.mock("@/maps/questions/radius", () => ({
    adjustPerRadius: vi
        .fn()
        .mockImplementation(async (_q: any, d: any) => d),
    hiderifyRadius: vi.fn().mockImplementation((q: any) => q),
    radiusPlanningPolygon: vi.fn().mockReturnValue({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [0, 0] },
        properties: {},
    }),
}));

vi.mock("@/maps/questions/thermometer", () => ({
    adjustPerThermometer: vi
        .fn()
        .mockImplementation(async (_q: any, d: any) => d),
    hiderifyThermometer: vi.fn().mockImplementation(async (q: any) => q),
    thermometerPlanningPolygon: vi.fn().mockResolvedValue({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [0, 0] },
        properties: {},
    }),
}));

vi.mock("@/maps/questions/tentacles", () => ({
    adjustPerTentacle: vi
        .fn()
        .mockImplementation(async (_q: any, d: any) => d),
    hiderifyTentacles: vi.fn().mockImplementation(async (q: any) => q),
    tentaclesPlanningPolygon: vi.fn().mockResolvedValue({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [0, 0] },
        properties: {},
    }),
}));

vi.mock("@/maps/questions/matching", () => ({
    adjustPerMatching: vi
        .fn()
        .mockImplementation(async (_q: any, d: any) => d),
    hiderifyMatching: vi.fn().mockImplementation(async (q: any) => q),
    matchingPlanningPolygon: vi.fn().mockResolvedValue({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [0, 0] },
        properties: {},
    }),
}));

vi.mock("@/maps/questions/measuring", () => ({
    adjustPerMeasuring: vi
        .fn()
        .mockImplementation(async (_q: any, d: any) => d),
    hiderifyMeasuring: vi.fn().mockImplementation(async (q: any) => q),
    measuringPlanningPolygon: vi.fn().mockResolvedValue({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [0, 0] },
        properties: {},
    }),
}));

import {
    adjustMapGeoDataForQuestion,
    applyQuestionsToMapGeoData,
    determinePlanningPolygon,
    hiderifyQuestion,
} from "@/maps/index";
import {
    adjustPerMatching,
    hiderifyMatching,
    matchingPlanningPolygon,
} from "@/maps/questions/matching";
import {
    adjustPerMeasuring,
    hiderifyMeasuring,
    measuringPlanningPolygon,
} from "@/maps/questions/measuring";
import {
    adjustPerRadius,
    hiderifyRadius,
    radiusPlanningPolygon,
} from "@/maps/questions/radius";
import {
    adjustPerTentacle,
    hiderifyTentacles,
    tentaclesPlanningPolygon,
} from "@/maps/questions/tentacles";
import {
    adjustPerThermometer,
    hiderifyThermometer,
    thermometerPlanningPolygon,
} from "@/maps/questions/thermometer";

const simpleMapData = {
    type: "FeatureCollection" as const,
    features: [
        {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [139, 35] },
            properties: {},
        },
    ],
};

const lockedRadius: any = {
    id: "radius",
    key: 0,
    data: {
        lat: 35,
        lng: 139,
        radius: 100,
        unit: "meters",
        within: true,
        drag: false,
        color: "red",
        collapsed: false,
    },
};

const unlockedRadius: any = {
    id: "radius",
    key: 0,
    data: {
        lat: 35,
        lng: 139,
        radius: 100,
        unit: "meters",
        within: true,
        drag: true,
        color: "red",
        collapsed: false,
    },
};

describe("Question Processing Pipeline", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("calls each question's adjust function in order when planningModeEnabled is false", async () => {
        const lockedThermometer: any = {
            id: "thermometer",
            key: 1,
            data: {
                latA: 35,
                lngA: 139,
                latB: 36,
                lngB: 140,
                warmer: true,
                drag: false,
                colorA: "blue",
                colorB: "green",
                collapsed: false,
            },
        };

        await applyQuestionsToMapGeoData(
            [lockedRadius, lockedThermometer],
            simpleMapData,
            false,
        );

        expect(adjustPerRadius).toHaveBeenCalledTimes(1);
        expect(adjustPerRadius).toHaveBeenCalledWith(
            lockedRadius.data,
            simpleMapData,
        );
        expect(adjustPerThermometer).toHaveBeenCalledTimes(1);
        expect(adjustPerThermometer).toHaveBeenCalledWith(
            lockedThermometer.data,
            simpleMapData,
        );
        expect(
            (adjustPerRadius as any).mock.invocationCallOrder[0],
        ).toBeLessThan(
            (adjustPerThermometer as any).mock.invocationCallOrder[0],
        );
    });

    it("skips unlocked questions when planningModeEnabled is true", async () => {
        await applyQuestionsToMapGeoData([unlockedRadius], simpleMapData, true);

        expect(adjustPerRadius).not.toHaveBeenCalled();
    });

    it("calls planningModeCallback with polygon and question for unlocked questions in planning mode, before elimination", async () => {
        const mockCallback = vi.fn();

        await applyQuestionsToMapGeoData(
            [unlockedRadius],
            simpleMapData,
            true,
            mockCallback,
        );

        expect(radiusPlanningPolygon).toHaveBeenCalledWith(
            unlockedRadius.data,
        );
        expect(mockCallback).toHaveBeenCalledWith(
            expect.objectContaining({ type: "Feature" }),
            unlockedRadius,
        );
        expect(adjustPerRadius).not.toHaveBeenCalled();
    });

    it("wraps non-FeatureCollection adjuster results in a FeatureCollection", async () => {
        const plainFeature = {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [0, 0] },
            properties: {},
        };
        (adjustPerRadius as any).mockResolvedValueOnce(plainFeature);

        const result = await applyQuestionsToMapGeoData(
            [lockedRadius],
            simpleMapData,
            false,
        );

        expect(result).toEqual({
            type: "FeatureCollection",
            features: [plainFeature],
        });
    });

    it("adjustMapGeoDataForQuestion dispatches to correct adjust function by question id", async () => {
        const radiusQ: any = {
            id: "radius",
            data: {
                lat: 35,
                lng: 139,
                radius: 100,
                unit: "meters",
                within: true,
            },
        };
        const thermoQ: any = {
            id: "thermometer",
            data: {
                latA: 35,
                lngA: 139,
                latB: 36,
                lngB: 140,
                warmer: true,
            },
        };
        const tentQ: any = {
            id: "tentacles",
            data: {
                lat: 35,
                lng: 139,
                radius: 15,
                unit: "meters",
                locationType: "museum",
            },
        };
        const matchQ: any = {
            id: "matching",
            data: { lat: 35, lng: 139, type: "airport", same: true },
        };
        const measQ: any = {
            id: "measuring",
            data: { lat: 35, lng: 139, type: "coastline", hiderCloser: true },
        };
        const unknownQ: any = { id: "unknown" };

        await adjustMapGeoDataForQuestion(radiusQ, simpleMapData);
        expect(adjustPerRadius).toHaveBeenCalledWith(
            radiusQ.data,
            simpleMapData,
        );

        await adjustMapGeoDataForQuestion(thermoQ, simpleMapData);
        expect(adjustPerThermometer).toHaveBeenCalledWith(
            thermoQ.data,
            simpleMapData,
        );

        await adjustMapGeoDataForQuestion(tentQ, simpleMapData);
        expect(adjustPerTentacle).toHaveBeenCalledWith(
            tentQ.data,
            simpleMapData,
        );

        await adjustMapGeoDataForQuestion(matchQ, simpleMapData);
        expect(adjustPerMatching).toHaveBeenCalledWith(
            matchQ.data,
            simpleMapData,
        );

        await adjustMapGeoDataForQuestion(measQ, simpleMapData);
        expect(adjustPerMeasuring).toHaveBeenCalledWith(
            measQ.data,
            simpleMapData,
        );

        const result = await adjustMapGeoDataForQuestion(
            unknownQ,
            simpleMapData,
        );
        expect(result).toBe(simpleMapData);
        expect(adjustPerMatching).toHaveBeenCalledTimes(1);
    });

    it("adjustMapGeoDataForQuestion falls back to adjustPerRadius when tentacles has location === false", async () => {
        const tentQNoLocation: any = {
            id: "tentacles",
            data: { lat: 35, lng: 139, radius: 100, location: false },
        };

        await adjustMapGeoDataForQuestion(tentQNoLocation, simpleMapData);

        expect(adjustPerRadius).toHaveBeenCalledWith(
            { lat: 35, lng: 139, radius: 100, location: false, within: false },
            simpleMapData,
        );
        expect(adjustPerTentacle).not.toHaveBeenCalled();
    });

    it("hiderifyQuestion dispatches to correct hiderify function by question id", async () => {
        const radiusQ: any = {
            id: "radius",
            data: { drag: true, lat: 35, lng: 139 },
        };
        const thermoQ: any = {
            id: "thermometer",
            data: { drag: true, latA: 35, lngA: 139, latB: 36, lngB: 140 },
        };
        const tentQ: any = {
            id: "tentacles",
            data: { drag: true, lat: 35, lng: 139 },
        };
        const matchQ: any = {
            id: "matching",
            data: { drag: true, lat: 35, lng: 139 },
        };
        const measQ: any = {
            id: "measuring",
            data: { drag: true, lat: 35, lng: 139 },
        };

        await hiderifyQuestion(radiusQ);
        expect(hiderifyRadius).toHaveBeenCalledWith(radiusQ.data);

        await hiderifyQuestion(thermoQ);
        expect(hiderifyThermometer).toHaveBeenCalledWith(thermoQ.data);

        await hiderifyQuestion(tentQ);
        expect(hiderifyTentacles).toHaveBeenCalledWith(tentQ.data);

        await hiderifyQuestion(matchQ);
        expect(hiderifyMatching).toHaveBeenCalledWith(matchQ.data);

        await hiderifyQuestion(measQ);
        expect(hiderifyMeasuring).toHaveBeenCalledWith(measQ.data);
    });

    it("hiderifyQuestion only hiderifies questions with drag: true", async () => {
        const lockedQ: any = {
            id: "radius",
            data: { drag: false, lat: 35, lng: 139 },
        };

        await hiderifyQuestion(unlockedRadius);
        expect(hiderifyRadius).toHaveBeenCalledTimes(1);

        await hiderifyQuestion(lockedQ);
        expect(hiderifyRadius).toHaveBeenCalledTimes(1);
    });

    it("determinePlanningPolygon dispatches to correct planning polygon generator by question id", async () => {
        const radiusQ: any = {
            id: "radius",
            data: { drag: true, lat: 35, lng: 139 },
        };
        const thermoQ: any = {
            id: "thermometer",
            data: { drag: true, latA: 35, lngA: 139, latB: 36, lngB: 140 },
        };
        const tentQ: any = {
            id: "tentacles",
            data: { drag: true, lat: 35, lng: 139 },
        };
        const matchQ: any = {
            id: "matching",
            data: { drag: true, lat: 35, lng: 139 },
        };
        const measQ: any = {
            id: "measuring",
            data: { drag: true, lat: 35, lng: 139 },
        };

        await determinePlanningPolygon(radiusQ, true);
        expect(radiusPlanningPolygon).toHaveBeenCalledWith(radiusQ.data);

        await determinePlanningPolygon(thermoQ, true);
        expect(thermometerPlanningPolygon).toHaveBeenCalledWith(thermoQ.data);

        await determinePlanningPolygon(tentQ, true);
        expect(tentaclesPlanningPolygon).toHaveBeenCalledWith(tentQ.data);

        await determinePlanningPolygon(matchQ, true);
        expect(matchingPlanningPolygon).toHaveBeenCalledWith(matchQ.data);

        await determinePlanningPolygon(measQ, true);
        expect(measuringPlanningPolygon).toHaveBeenCalledWith(measQ.data);
    });

    it("determinePlanningPolygon returns undefined when planningModeEnabled is false or drag is false", async () => {
        const nullResult = await determinePlanningPolygon(
            unlockedRadius,
            false,
        );
        expect(nullResult).toBeUndefined();

        const nullResult2 = await determinePlanningPolygon(lockedRadius, true);
        expect(nullResult2).toBeUndefined();
    });
});
