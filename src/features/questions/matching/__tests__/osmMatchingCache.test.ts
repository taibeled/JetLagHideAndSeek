import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    clearOsmMatchingMemoryCache,
    containsSearchCircle,
    findMatchingFeaturesWithCache,
    getOverscanRadius,
    MATCHING_CACHE_TTL_MS,
    OVERSCAN_FACTOR,
} from "../osmMatchingCache";

// ─── Module-level mocks ───────────────────────────────────────────────────────

const mockFetchAndParse = jest.fn<Promise<any[]>, any[]>();

jest.mock("../osmMatching", () => ({
    DEFAULT_SEARCH_RADIUS_METERS: 50_000,
    fetchAndParseOverpassFeatures: (...args: unknown[]) =>
        mockFetchAndParse(...args),
    rankMatchingFeatures:
        jest.requireActual("../osmMatching").rankMatchingFeatures,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const tokyoCenter: [number, number] = [139.767125, 35.681236];
const nearTokyoCenter: [number, number] = [139.777, 35.681]; // ~750 m east

const hospitalFeatures = [
    {
        lat: 35.685,
        lon: 139.77,
        name: "Tokyo Hospital",
        osmId: 1,
        osmType: "node" as const,
        tags: {},
    },
    {
        lat: 35.69,
        lon: 139.78,
        name: "Shinjuku Medical",
        osmId: 2,
        osmType: "way" as const,
        tags: {},
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetAll() {
    clearOsmMatchingMemoryCache();
    (AsyncStorage.clear as jest.Mock)();
}

// ─── containsSearchCircle ─────────────────────────────────────────────────────

describe("containsSearchCircle", () => {
    it("returns true when requested circle is identical to cached circle", () => {
        expect(
            containsSearchCircle(35.68, 139.76, 5000, 35.68, 139.76, 5000),
        ).toBe(true);
    });

    it("returns true when requested circle is strictly inside cached circle", () => {
        // Center moved 750 m east, so dist ≈ 750. 750 + 3000 = 3750 <= 5000.
        expect(
            containsSearchCircle(35.68, 139.76, 5000, 35.68, 139.767, 3000),
        ).toBe(true);
    });

    it("returns false when requested circle extends beyond cached circle", () => {
        // dist ≈ 750. 750 + 5000 = 5750 > 5000.
        expect(
            containsSearchCircle(35.68, 139.76, 5000, 35.68, 139.767, 5000),
        ).toBe(false);
    });

    it("returns false when centers are far apart", () => {
        expect(
            containsSearchCircle(35.68, 139.76, 50_000, 35.68, 141.0, 50_000),
        ).toBe(false);
    });

    it("returns true when overscan circle contains exact-radius request", () => {
        // Overscan circle at A with radius 75 km covers request at B (5 km away)
        // with radius 50 km: 5000 + 50_000 = 55_000 <= 75_000.
        expect(
            containsSearchCircle(
                35.68,
                139.76,
                75_000,
                35.68,
                139.815, // ~3.5 km east at Tokyo latitude
                50_000,
            ),
        ).toBe(true);
    });
});

// ─── getOverscanRadius ────────────────────────────────────────────────────────

describe("getOverscanRadius", () => {
    it("multiplies by OVERSCAN_FACTOR and rounds up", () => {
        const result = getOverscanRadius(50_000);
        expect(result).toBe(Math.ceil(50_000 * OVERSCAN_FACTOR));
        expect(result).toBeGreaterThan(50_000);
    });
});

// ─── findMatchingFeaturesWithCache ────────────────────────────────────────────

describe("findMatchingFeaturesWithCache", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetAll();
        mockFetchAndParse.mockResolvedValue(hospitalFeatures);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("fetches from network on first call and returns ranked candidates", async () => {
        const result = await findMatchingFeaturesWithCache(
            "hospital",
            tokyoCenter,
        );

        expect(result.source).toBe("network");
        expect(result.candidates).toHaveLength(hospitalFeatures.length);
        expect(mockFetchAndParse).toHaveBeenCalledTimes(1);
    });

    it("uses overscan radius for network fetch", async () => {
        await findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });

        // fetchAndParseOverpassFeatures(category, center, radiusMeters, signal?)
        const [, , calledRadius] = mockFetchAndParse.mock.calls[0];
        expect(calledRadius).toBe(getOverscanRadius(5000));
        expect(calledRadius).toBeGreaterThan(5000);
    });

    it("returns memory hit on second call without another network request", async () => {
        await findMatchingFeaturesWithCache("hospital", tokyoCenter);
        jest.clearAllMocks();

        const result = await findMatchingFeaturesWithCache(
            "hospital",
            tokyoCenter,
        );

        expect(result.source).toBe("memory");
        expect(mockFetchAndParse).not.toHaveBeenCalled();
    });

    it("serves nearby center from memory without another network request", async () => {
        await findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });
        jest.clearAllMocks();

        // nearTokyoCenter is ~750 m from tokyoCenter; overscan was 7500 m,
        // so dist + 5000 ≈ 750 + 5000 = 5750 <= 7500 → should be a cache hit.
        const result = await findMatchingFeaturesWithCache(
            "hospital",
            nearTokyoCenter,
            { requestedRadiusMeters: 5000 },
        );

        expect(result.source).toBe("memory");
        expect(mockFetchAndParse).not.toHaveBeenCalled();
        // Candidates are re-ranked from the new center.
        expect(result.candidates.length).toBeGreaterThan(0);
    });

    it("fetches again when center is outside the cached overscan circle", async () => {
        const farCenter: [number, number] = [141.0, 35.68]; // ~100 km east

        await findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });
        jest.clearAllMocks();

        const result = await findMatchingFeaturesWithCache(
            "hospital",
            farCenter,
            {
                requestedRadiusMeters: 5000,
            },
        );

        expect(result.source).toBe("network");
        expect(mockFetchAndParse).toHaveBeenCalledTimes(1);
    });

    it("returns disk hit after memory is cleared", async () => {
        await findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });
        // Flush memory but keep AsyncStorage.
        clearOsmMatchingMemoryCache();
        jest.clearAllMocks();

        const result = await findMatchingFeaturesWithCache(
            "hospital",
            tokyoCenter,
            {
                requestedRadiusMeters: 5000,
            },
        );

        expect(result.source).toBe("disk");
        expect(mockFetchAndParse).not.toHaveBeenCalled();
    });

    it("returns stale result and triggers background refresh when TTL exceeded", async () => {
        await findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });
        // Reset call count so we only count refreshes triggered by the stale hit.
        mockFetchAndParse.mockClear();

        // Age the cached entry past TTL.
        jest.spyOn(Date, "now").mockReturnValue(
            Date.now() + MATCHING_CACHE_TTL_MS + 1,
        );

        const freshFeatures = [
            {
                lat: 35.69,
                lon: 139.78,
                name: "New Hospital",
                osmId: 99,
                osmType: "node" as const,
                tags: {},
            },
        ];
        mockFetchAndParse.mockResolvedValue(freshFeatures);

        const result = await findMatchingFeaturesWithCache(
            "hospital",
            tokyoCenter,
            {
                requestedRadiusMeters: 5000,
            },
        );

        expect(result.source).toBe("stale");
        // Returns the old candidates immediately.
        expect(result.candidates.some((c) => c.name === "Tokyo Hospital")).toBe(
            true,
        );

        // Let the background refresh complete.
        await Promise.resolve();
        await Promise.resolve();

        expect(mockFetchAndParse).toHaveBeenCalledTimes(1);

        jest.spyOn(Date, "now").mockRestore();
    });

    it("deduplicates simultaneous in-flight requests for the same key", async () => {
        let resolveFirst!: (value: typeof hospitalFeatures) => void;
        mockFetchAndParse.mockReturnValue(
            new Promise((resolve) => {
                resolveFirst = resolve;
            }),
        );

        const p1 = findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });
        const p2 = findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });

        resolveFirst(hospitalFeatures);
        const [r1, r2] = await Promise.all([p1, p2]);

        // Only one actual fetch should have been made.
        expect(mockFetchAndParse).toHaveBeenCalledTimes(1);
        expect(r1.source).toBe("network");
        expect(r2.source).toBe("network");
    });

    it("caches empty results as a valid cache entry", async () => {
        mockFetchAndParse.mockResolvedValue([]);

        await findMatchingFeaturesWithCache("hospital", tokyoCenter);
        jest.clearAllMocks();

        const result = await findMatchingFeaturesWithCache(
            "hospital",
            tokyoCenter,
        );

        expect(result.source).toBe("memory");
        expect(result.candidates).toEqual([]);
        expect(mockFetchAndParse).not.toHaveBeenCalled();
    });

    it("force-refresh bypasses cache and fetches fresh data", async () => {
        await findMatchingFeaturesWithCache("hospital", tokyoCenter);
        jest.clearAllMocks();

        const freshFeatures = [
            {
                lat: 35.69,
                lon: 139.78,
                name: "Refreshed Hospital",
                osmId: 99,
                osmType: "node" as const,
                tags: {},
            },
        ];
        mockFetchAndParse.mockResolvedValue(freshFeatures);

        const result = await findMatchingFeaturesWithCache(
            "hospital",
            tokyoCenter,
            { forceRefresh: true },
        );

        expect(result.source).toBe("network");
        expect(mockFetchAndParse).toHaveBeenCalledTimes(1);
        expect(result.candidates[0].name).toBe("Refreshed Hospital");
    });

    it("returns empty candidates for non-searchable categories", async () => {
        const result = await findMatchingFeaturesWithCache(
            "transit-line",
            tokyoCenter,
        );

        expect(result.candidates).toEqual([]);
        expect(mockFetchAndParse).not.toHaveBeenCalled();
    });

    it("does not share cache between different categories", async () => {
        await findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });
        jest.clearAllMocks();

        const result = await findMatchingFeaturesWithCache(
            "museum",
            tokyoCenter,
            {
                requestedRadiusMeters: 5000,
            },
        );

        expect(result.source).toBe("network");
        expect(mockFetchAndParse).toHaveBeenCalledTimes(1);
    });

    it("persists result to AsyncStorage for disk retrieval", async () => {
        await findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });

        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter((k) =>
            k.startsWith("osm-matching-cache:"),
        );
        expect(cacheKeys.length).toBeGreaterThan(0);
    });

    it("writes a manifest entry after a network fetch", async () => {
        await findMatchingFeaturesWithCache("hospital", tokyoCenter, {
            requestedRadiusMeters: 5000,
        });

        const raw = await AsyncStorage.getItem("osm-matching-manifest");
        expect(raw).not.toBeNull();
        const manifest = JSON.parse(raw!);
        expect(manifest.rows.length).toBeGreaterThan(0);
        expect(manifest.rows[0].category).toBe("hospital");
    });

    it("candidates are sorted by distance from center", async () => {
        const result = await findMatchingFeaturesWithCache(
            "hospital",
            tokyoCenter,
        );

        for (let i = 1; i < result.candidates.length; i++) {
            expect(result.candidates[i - 1].distanceMeters).toBeLessThanOrEqual(
                result.candidates[i].distanceMeters,
            );
        }
    });
});
