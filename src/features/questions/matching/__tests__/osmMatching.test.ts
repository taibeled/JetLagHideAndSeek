import {
    buildOverpassQuery,
    findMatchingFeatures,
    findNearestFeature,
    parseOverpassElements,
} from "../osmMatching";

describe("buildOverpassQuery", () => {
    it("builds a query with the given tags, lat, lon, and radius", () => {
        const query = buildOverpassQuery(
            '["leisure"="park"]',
            35.68,
            139.76,
            5000,
        );
        expect(query).toContain("[out:json][timeout:30]");
        expect(query).toContain(
            'node["leisure"="park"](around:5000,35.68,139.76)',
        );
        expect(query).toContain(
            'way["leisure"="park"](around:5000,35.68,139.76)',
        );
        expect(query).toContain(
            'relation["leisure"="park"](around:5000,35.68,139.76)',
        );
        expect(query).toContain("out center tags qt;");
    });

    it("does not cap the Overpass response with a numeric limit", () => {
        const query = buildOverpassQuery(
            '["tourism"="museum"]',
            35.68,
            139.76,
            50_000,
        );
        // The old buggy format appended `50` which Overpass interprets as a max
        // element count. Ensure we do not append any number after `qt`.
        expect(query).not.toMatch(/out center tags qt\s*\d/);
    });
});

describe("parseOverpassElements", () => {
    it("parses nodes with lat/lon", () => {
        const elements = [
            {
                id: 1,
                lat: 35.68,
                lon: 139.76,
                tags: { name: "Test Park" },
                type: "node" as const,
            },
        ];
        const features = parseOverpassElements(elements);
        expect(features).toHaveLength(1);
        expect(features[0]).toMatchObject({
            lat: 35.68,
            lon: 139.76,
            name: "Test Park",
            osmId: 1,
            osmType: "node",
        });
    });

    it("parses ways with center", () => {
        const elements = [
            {
                center: { lat: 35.69, lon: 139.77 },
                id: 2,
                tags: { name: "Test Way" },
                type: "way" as const,
            },
        ];
        const features = parseOverpassElements(elements);
        expect(features).toHaveLength(1);
        expect(features[0]).toMatchObject({
            lat: 35.69,
            lon: 139.77,
            name: "Test Way",
            osmId: 2,
            osmType: "way",
        });
    });

    it("parses relations with center", () => {
        const elements = [
            {
                center: { lat: 35.7, lon: 139.78 },
                id: 3,
                tags: { name: "Test Relation" },
                type: "relation" as const,
            },
        ];
        const features = parseOverpassElements(elements);
        expect(features).toHaveLength(1);
        expect(features[0]).toMatchObject({
            lat: 35.7,
            lon: 139.78,
            name: "Test Relation",
            osmId: 3,
            osmType: "relation",
        });
    });

    it("skips elements without a name", () => {
        const elements = [
            {
                id: 4,
                lat: 35.68,
                lon: 139.76,
                tags: {} as Record<string, string>,
                type: "node" as const,
            },
            {
                id: 5,
                lat: 35.68,
                lon: 139.76,
                tags: { name: "" },
                type: "node" as const,
            },
        ];
        const features = parseOverpassElements(elements);
        expect(features).toHaveLength(0);
    });

    it("skips elements without coordinates", () => {
        const elements = [
            {
                id: 6,
                tags: { name: "No Coord" },
                type: "way" as const,
            },
        ];
        const features = parseOverpassElements(elements);
        expect(features).toHaveLength(0);
    });

    it("skips unknown element types", () => {
        const elements = [
            {
                id: 7,
                lat: 35.68,
                lon: 139.76,
                tags: { name: "Area" },
                type: "area" as const,
            },
        ];
        const features = parseOverpassElements(elements);
        expect(features).toHaveLength(0);
    });

    it("trims whitespace from names", () => {
        const elements = [
            {
                id: 8,
                lat: 35.68,
                lon: 139.76,
                tags: { name: "  Trimmed  " },
                type: "node" as const,
            },
        ];
        const features = parseOverpassElements(elements);
        expect(features[0].name).toBe("Trimmed");
    });
});

describe("findNearestFeature", () => {
    it("returns null for an empty list", () => {
        expect(findNearestFeature([139.76, 35.68], [])).toBeNull();
    });

    it("finds the nearest feature by haversine distance", () => {
        const features = [
            {
                lat: 35.7,
                lon: 139.8,
                name: "Far",
                osmId: 1,
                osmType: "node" as const,
                tags: {},
            },
            {
                lat: 35.681,
                lon: 139.761,
                name: "Near",
                osmId: 2,
                osmType: "node" as const,
                tags: {},
            },
            {
                lat: 35.69,
                lon: 139.79,
                name: "Medium",
                osmId: 3,
                osmType: "node" as const,
                tags: {},
            },
        ];
        const nearest = findNearestFeature([139.76, 35.68], features);
        expect(nearest?.name).toBe("Near");
        expect(nearest?.osmId).toBe(2);
    });

    it("handles features with identical coordinates", () => {
        const features = [
            {
                lat: 35.68,
                lon: 139.76,
                name: "A",
                osmId: 1,
                osmType: "node" as const,
                tags: {},
            },
            {
                lat: 35.68,
                lon: 139.76,
                name: "B",
                osmId: 2,
                osmType: "node" as const,
                tags: {},
            },
        ];
        const nearest = findNearestFeature([139.76, 35.68], features);
        expect(nearest).not.toBeNull();
    });
});

describe("findMatchingFeatures", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    function mockFetch(elements: unknown[]) {
        globalThis.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({ elements }),
            ok: true,
        });
    }

    it("returns all features sorted by distance from center", async () => {
        mockFetch([
            {
                id: 1,
                lat: 35.7,
                lon: 139.8,
                tags: { name: "Far" },
                type: "node",
            },
            {
                id: 2,
                lat: 35.681,
                lon: 139.761,
                tags: { name: "Near" },
                type: "node",
            },
            {
                id: 3,
                lat: 35.69,
                lon: 139.79,
                tags: { name: "Medium" },
                type: "node",
            },
        ]);

        const result = await findMatchingFeatures("park", [139.76, 35.68]);

        expect(result).toHaveLength(3);
        expect(result[0].name).toBe("Near");
        expect(result[1].name).toBe("Medium");
        expect(result[2].name).toBe("Far");
        expect(result[0].distanceMeters).toBeLessThan(result[1].distanceMeters);
        expect(result[1].distanceMeters).toBeLessThan(result[2].distanceMeters);
    });

    it("limits results to maxCandidates", async () => {
        mockFetch([
            { id: 1, lat: 35.7, lon: 139.8, tags: { name: "A" }, type: "node" },
            {
                id: 2,
                lat: 35.701,
                lon: 139.801,
                tags: { name: "B" },
                type: "node",
            },
            {
                id: 3,
                lat: 35.702,
                lon: 139.802,
                tags: { name: "C" },
                type: "node",
            },
            {
                id: 4,
                lat: 35.703,
                lon: 139.803,
                tags: { name: "D" },
                type: "node",
            },
            {
                id: 5,
                lat: 35.704,
                lon: 139.804,
                tags: { name: "E" },
                type: "node",
            },
            {
                id: 6,
                lat: 35.705,
                lon: 139.805,
                tags: { name: "F" },
                type: "node",
            },
            {
                id: 7,
                lat: 35.706,
                lon: 139.806,
                tags: { name: "G" },
                type: "node",
            },
            {
                id: 8,
                lat: 35.707,
                lon: 139.807,
                tags: { name: "H" },
                type: "node",
            },
            {
                id: 9,
                lat: 35.708,
                lon: 139.808,
                tags: { name: "I" },
                type: "node",
            },
            {
                id: 10,
                lat: 35.709,
                lon: 139.809,
                tags: { name: "J" },
                type: "node",
            },
            {
                id: 11,
                lat: 35.71,
                lon: 139.81,
                tags: { name: "K" },
                type: "node",
            },
        ]);

        const result = await findMatchingFeatures("park", [139.76, 35.68]);
        expect(result).toHaveLength(10);
    });

    it("allows custom maxCandidates", async () => {
        mockFetch([
            { id: 1, lat: 35.7, lon: 139.8, tags: { name: "A" }, type: "node" },
            {
                id: 2,
                lat: 35.701,
                lon: 139.801,
                tags: { name: "B" },
                type: "node",
            },
            {
                id: 3,
                lat: 35.702,
                lon: 139.802,
                tags: { name: "C" },
                type: "node",
            },
        ]);

        const result = await findMatchingFeatures("park", [139.76, 35.68], {
            maxCandidates: 2,
        });
        expect(result).toHaveLength(2);
    });

    it("uses custom searchRadiusMeters", async () => {
        mockFetch([]);

        await findMatchingFeatures("park", [139.76, 35.68], {
            searchRadiusMeters: 10000,
        });

        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.stringContaining("10000"),
        );
    });

    it("returns empty array when no elements match", async () => {
        mockFetch([]);
        const result = await findMatchingFeatures("park", [139.76, 35.68]);
        expect(result).toEqual([]);
    });

    it("returns empty array for categories without OSM tags", async () => {
        const result = await findMatchingFeatures(
            "transit-line",
            [139.76, 35.68],
        );
        expect(result).toEqual([]);
    });

    it("throws on Overpass API error", async () => {
        globalThis.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 504,
        });

        await expect(
            findMatchingFeatures("park", [139.76, 35.68]),
        ).rejects.toThrow("Overpass API error 504");
    });

    it("includes distanceMeters on each feature", async () => {
        mockFetch([
            {
                id: 2,
                lat: 35.681,
                lon: 139.761,
                tags: { name: "Near" },
                type: "node",
            },
        ]);

        const result = await findMatchingFeatures("park", [139.76, 35.68]);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            name: "Near",
            distanceMeters: expect.any(Number),
        });
        expect(result[0].distanceMeters).toBeGreaterThan(0);
    });
});
