import AsyncStorage from "@react-native-async-storage/async-storage";
import osmtogeojson from "osmtogeojson";

import type { GeoJsonFeatureCollection } from "../geojsonTypes";

import {
    buildPlayAreaFromBoundary,
    buildPlayAreaFromOverpass,
    clearPlayAreaMemoryCache,
    fetchPlayAreaBoundary,
    isBundledPlayAreaId,
    loadPlayAreaByRelationId,
    parseRelationId,
    warmBoundaryCacheFromStorage,
} from "../playAreaBoundary";

jest.mock("osmtogeojson", () => ({
    __esModule: true,
    default: jest.fn(),
}));

const mockedOsmToGeoJson = osmtogeojson as jest.MockedFunction<
    typeof osmtogeojson
>;

const osakaBoundary = {
    features: [
        {
            geometry: {
                coordinates: [
                    [
                        [135.35, 34.5],
                        [135.7, 34.5],
                        [135.7, 34.82],
                        [135.35, 34.82],
                        [135.35, 34.5],
                    ],
                ],
                type: "Polygon",
            },
            properties: { name: "Osaka" },
            type: "Feature",
        },
        {
            geometry: { coordinates: [135.5, 34.7], type: "Point" },
            properties: { name: "Ignore me" },
            type: "Feature",
        },
    ],
    type: "FeatureCollection",
};

describe("playAreaBoundary", () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        clearPlayAreaMemoryCache();
        await AsyncStorage.clear();
        globalThis.fetch = jest.fn();
    });

    it("validates direct OSM relation IDs", () => {
        expect(parseRelationId("358674")).toBe(358674);
        expect(parseRelationId(" 358674 ")).toBe(358674);
        expect(parseRelationId("")).toBeNull();
        expect(parseRelationId("-1")).toBeNull();
        expect(parseRelationId("way/358674")).toBeNull();
    });

    it("returns bundled Tokyo without network", async () => {
        const result = await loadPlayAreaByRelationId(19631009);

        expect(result.cacheSource).toBe("bundled");
        expect(result.playArea.label).toBe("Tokyo 23 Wards");
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("converts mocked Overpass Osaka geometry into a play area", () => {
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);

        const playArea = buildPlayAreaFromOverpass(358674, {
            elements: [],
        });

        expect(playArea.label).toBe("Osaka");
        expect(playArea.osmId).toBe(358674);
        expect(playArea.boundary.features).toHaveLength(1);
        expect(playArea.bbox).toEqual([135.35, 34.5, 135.7, 34.82]);
    });

    it("caches fetched relation boundaries in AsyncStorage", async () => {
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
        (globalThis.fetch as jest.Mock).mockResolvedValue({
            json: jest.fn().mockResolvedValue({ elements: [] }),
            ok: true,
        });

        const first = await loadPlayAreaByRelationId(999999);
        clearPlayAreaMemoryCache();
        const second = await loadPlayAreaByRelationId(999999);

        expect(first.cacheSource).toBe("fetched");
        expect(second.cacheSource).toBe("persisted");
        expect(second.playArea.label).toBe("Osaka");
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        const raw = await AsyncStorage.getItem("play-area-boundary:999999");
        expect(JSON.parse(raw ?? "{}")).toMatchObject({
            cachedAt: expect.any(String),
            playArea: { osmId: 999999 },
        });
    });

    it("warms persisted boundaries into the in-memory cache", async () => {
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
        (globalThis.fetch as jest.Mock).mockResolvedValue({
            json: jest.fn().mockResolvedValue({ elements: [] }),
            ok: true,
        });

        await loadPlayAreaByRelationId(999999);
        clearPlayAreaMemoryCache();
        await warmBoundaryCacheFromStorage();
        await AsyncStorage.removeItem("play-area-boundary:999999");

        const result = await loadPlayAreaByRelationId(999999);

        expect(result.cacheSource).toBe("memory");
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("refetches and replaces corrupted persisted boundaries", async () => {
        await AsyncStorage.setItem("play-area-boundary:999999", "not json");
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
        (globalThis.fetch as jest.Mock).mockResolvedValue({
            json: jest.fn().mockResolvedValue({ elements: [] }),
            ok: true,
        });

        const result = await loadPlayAreaByRelationId(999999);

        expect(result.cacheSource).toBe("fetched");
        expect(result.playArea.label).toBe("Osaka");
    });

    it("identifies bundled play area IDs", () => {
        expect(isBundledPlayAreaId(19631009)).toBe(true);
        expect(isBundledPlayAreaId(358674)).toBe(true);
        expect(isBundledPlayAreaId(999999)).toBe(false);
    });

    it("throws when Overpass API returns non-ok", async () => {
        (globalThis.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 429,
        });

        await expect(fetchPlayAreaBoundary(999999)).rejects.toThrow(
            "Overpass API error 429",
        );
    });

    it("throws when boundary has no polygon features", () => {
        const empty: GeoJsonFeatureCollection = {
            features: [],
            type: "FeatureCollection",
        };

        expect(() => buildPlayAreaFromBoundary(999999, empty)).toThrow(
            "No polygon boundary",
        );
    });
});
