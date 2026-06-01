import AsyncStorage from "@react-native-async-storage/async-storage";
import osmtogeojson from "osmtogeojson";

import type { GeoJsonFeatureCollection } from "../geojsonTypes";

import {
    BOUNDARY_CACHE_TTL_MS,
    buildPlayAreaFromBoundary,
    buildPlayAreaFromOverpass,
    clearPlayAreaMemoryCache,
    ensurePlayAreaBoundaryCached,
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

const CACHE_KEY = "play-area-boundary:999999";

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

function makeCachedOsaka(label = "Osaka") {
    return {
        ...buildPlayAreaFromBoundary(999999, {
            features: [osakaBoundary.features[0]],
            type: "FeatureCollection",
        } as unknown as GeoJsonFeatureCollection),
        label,
    };
}

async function storeCachedOsaka(cachedAt: string | null, label = "Osaka") {
    const playArea = makeCachedOsaka(label);
    await AsyncStorage.setItem(
        CACHE_KEY,
        cachedAt === null
            ? JSON.stringify(playArea)
            : JSON.stringify({ cachedAt, playArea }),
    );
}

function makeOverpassResponse() {
    return {
        json: jest.fn().mockResolvedValue({ elements: [] }),
        ok: true,
    };
}

function makeDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

async function flushBackgroundWork() {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}

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
        (globalThis.fetch as jest.Mock).mockResolvedValue(
            makeOverpassResponse(),
        );

        const first = await loadPlayAreaByRelationId(999999);
        clearPlayAreaMemoryCache();
        const second = await loadPlayAreaByRelationId(999999);

        expect(first.cacheSource).toBe("fetched");
        expect(second.cacheSource).toBe("persisted");
        expect(second.playArea.label).toBe("Osaka");
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        const raw = await AsyncStorage.getItem(CACHE_KEY);
        expect(JSON.parse(raw ?? "{}")).toMatchObject({
            cachedAt: expect.any(String),
            playArea: { osmId: 999999 },
        });
    });

    it("warms persisted boundaries into the in-memory cache", async () => {
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
        (globalThis.fetch as jest.Mock).mockResolvedValue(
            makeOverpassResponse(),
        );

        await loadPlayAreaByRelationId(999999);
        clearPlayAreaMemoryCache();
        await warmBoundaryCacheFromStorage();
        await AsyncStorage.removeItem(CACHE_KEY);

        const result = await loadPlayAreaByRelationId(999999);

        expect(result.cacheSource).toBe("memory");
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("refetches and replaces corrupted persisted boundaries", async () => {
        await AsyncStorage.setItem("play-area-boundary:999999", "not json");
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
        (globalThis.fetch as jest.Mock).mockResolvedValue(
            makeOverpassResponse(),
        );

        const result = await loadPlayAreaByRelationId(999999);

        expect(result.cacheSource).toBe("fetched");
        expect(result.playArea.label).toBe("Osaka");
    });

    it("returns a fresh persisted boundary without revalidating it", async () => {
        await storeCachedOsaka(new Date().toISOString());

        const result = await loadPlayAreaByRelationId(999999);

        expect(result.cacheSource).toBe("persisted");
        expect(result.playArea.label).toBe("Osaka");
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("returns a stale boundary immediately and deduplicates its background refresh", async () => {
        await storeCachedOsaka(
            new Date(Date.now() - BOUNDARY_CACHE_TTL_MS - 1).toISOString(),
            "Stale Osaka",
        );
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
        const response =
            makeDeferred<ReturnType<typeof makeOverpassResponse>>();
        (globalThis.fetch as jest.Mock).mockReturnValue(response.promise);

        const persisted = await loadPlayAreaByRelationId(999999);
        const memory = await loadPlayAreaByRelationId(999999);

        expect(persisted).toMatchObject({
            cacheSource: "persisted",
            playArea: { label: "Stale Osaka" },
        });
        expect(memory).toMatchObject({
            cacheSource: "memory",
            playArea: { label: "Stale Osaka" },
        });
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        response.resolve(makeOverpassResponse());
        await flushBackgroundWork();

        const refreshed = await loadPlayAreaByRelationId(999999);
        expect(refreshed).toMatchObject({
            cacheSource: "memory",
            playArea: { label: "Osaka" },
        });
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        await ensurePlayAreaBoundaryCached({ ...persisted.playArea });
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        expect(JSON.parse(raw ?? "{}")).toMatchObject({
            playArea: { label: "Osaka" },
        });
    });

    it("keeps serving stale boundaries when background refresh fails", async () => {
        await storeCachedOsaka(
            new Date(Date.now() - BOUNDARY_CACHE_TTL_MS - 1).toISOString(),
            "Stale Osaka",
        );
        (globalThis.fetch as jest.Mock).mockRejectedValue(
            new Error("Overpass is unavailable"),
        );

        const result = await loadPlayAreaByRelationId(999999);
        await flushBackgroundWork();

        expect(result.playArea.label).toBe("Stale Osaka");
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        expect(JSON.parse(raw ?? "{}")).toMatchObject({
            playArea: { label: "Stale Osaka" },
        });
    });

    it("does not revalidate stale boundaries during app-state cache writes", async () => {
        await storeCachedOsaka(
            new Date(Date.now() - BOUNDARY_CACHE_TTL_MS - 1).toISOString(),
            "Stale Osaka",
        );

        await ensurePlayAreaBoundaryCached(makeCachedOsaka("App State Osaka"));

        expect(globalThis.fetch).not.toHaveBeenCalled();
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        expect(JSON.parse(raw ?? "{}")).toMatchObject({
            playArea: { label: "Stale Osaka" },
        });
    });

    it("revalidates legacy boundary entries without cache metadata", async () => {
        await storeCachedOsaka(null, "Legacy Osaka");
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
        (globalThis.fetch as jest.Mock).mockResolvedValue(
            makeOverpassResponse(),
        );

        const result = await loadPlayAreaByRelationId(999999);
        await flushBackgroundWork();

        expect(result.playArea.label).toBe("Legacy Osaka");
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        expect(JSON.parse(raw ?? "{}")).toMatchObject({
            cachedAt: expect.any(String),
            playArea: { label: "Osaka" },
        });
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
