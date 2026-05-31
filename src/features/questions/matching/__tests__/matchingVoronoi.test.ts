import type { Bbox } from "@/features/map/geojsonTypes";
import type { OsmFeature } from "@/features/questions/matching/matchingTypes";
import {
    buildOsmMatchingHitMask,
    buildOsmMatchingMissMask,
    computeVoronoiCells,
} from "@/features/questions/matching/matchingVoronoi";

const playAreaBbox: Bbox = [139.6, 35.6, 139.8, 35.75];

const mockCandidates: (OsmFeature & { distanceMeters: number })[] = [
    {
        distanceMeters: 150,
        lat: 35.681,
        lon: 139.7,
        name: "Candidate A",
        osmId: 1,
        osmType: "node",
        tags: {},
    },
    {
        distanceMeters: 900,
        lat: 35.65,
        lon: 139.72,
        name: "Candidate B",
        osmId: 2,
        osmType: "node",
        tags: {},
    },
    {
        distanceMeters: 2100,
        lat: 35.72,
        lon: 139.68,
        name: "Candidate C",
        osmId: 3,
        osmType: "node",
        tags: {},
    },
];

const mockCandidatesWithTypeCollision: (OsmFeature & {
    distanceMeters: number;
})[] = [
    {
        distanceMeters: 150,
        lat: 35.681,
        lon: 139.7,
        name: "Node 1",
        osmId: 1,
        osmType: "node",
        tags: {},
    },
    {
        distanceMeters: 900,
        lat: 35.65,
        lon: 139.72,
        name: "Way 1",
        osmId: 1,
        osmType: "way",
        tags: {},
    },
];

describe("computeVoronoiCells", () => {
    it("returns a FeatureCollection of polygons", () => {
        const result = computeVoronoiCells(mockCandidates, playAreaBbox);

        expect(result.type).toBe("FeatureCollection");
        expect(result.features.length).toBe(mockCandidates.length);
        expect(result.features[0].geometry.type).toBe("Polygon");
    });

    it("preserves osmKey on each cell", () => {
        const result = computeVoronoiCells(mockCandidates, playAreaBbox);

        expect(result.features[0].properties?.osmKey).toBe("node/1");
        expect(result.features[1].properties?.osmKey).toBe("node/2");
        expect(result.features[2].properties?.osmKey).toBe("node/3");
    });

    it("cells are clipped to play area bbox", () => {
        const result = computeVoronoiCells(mockCandidates, playAreaBbox);

        // Each cell should be within the bbox (simplified check: cell has valid coordinates)
        for (const feature of result.features) {
            const coords = feature.geometry.coordinates[0];
            for (const [lon, lat] of coords) {
                expect(lon).toBeGreaterThanOrEqual(playAreaBbox[0]);
                expect(lon).toBeLessThanOrEqual(playAreaBbox[2]);
                expect(lat).toBeGreaterThanOrEqual(playAreaBbox[1]);
                expect(lat).toBeLessThanOrEqual(playAreaBbox[3]);
            }
        }
    });

    it("returns empty FeatureCollection for empty candidates", () => {
        const result = computeVoronoiCells([], playAreaBbox);

        expect(result.features.length).toBe(0);
    });

    it("stores composite osmKey (type/id) on each cell", () => {
        const result = computeVoronoiCells(mockCandidates, playAreaBbox);

        expect(result.features[0].properties?.osmKey).toBe("node/1");
        expect(result.features[1].properties?.osmKey).toBe("node/2");
        expect(result.features[2].properties?.osmKey).toBe("node/3");
    });

    it("deduplicates candidates with duplicate coordinates before Voronoi", () => {
        const duplicates: (OsmFeature & { distanceMeters: number })[] = [
            {
                distanceMeters: 100,
                lat: 35.681,
                lon: 139.7,
                name: "Same Spot A",
                osmId: 1,
                osmType: "node",
                tags: {},
            },
            {
                distanceMeters: 200,
                lat: 35.681,
                lon: 139.7,
                name: "Same Spot B",
                osmId: 2,
                osmType: "node",
                tags: {},
            },
            {
                distanceMeters: 300,
                lat: 35.72,
                lon: 139.68,
                name: "Different Spot",
                osmId: 3,
                osmType: "node",
                tags: {},
            },
        ];

        const result = computeVoronoiCells(duplicates, playAreaBbox);

        // Should have 2 unique coordinate points, not 3
        expect(result.features.length).toBe(2);
    });

    it("deduplicates candidates with duplicate osmType+osmId before Voronoi", () => {
        const duplicates: (OsmFeature & { distanceMeters: number })[] = [
            {
                distanceMeters: 100,
                lat: 35.681,
                lon: 139.7,
                name: "First",
                osmId: 1,
                osmType: "node",
                tags: {},
            },
            {
                distanceMeters: 200,
                lat: 35.682,
                lon: 139.701,
                name: "Duplicate ID",
                osmId: 1,
                osmType: "node",
                tags: {},
            },
        ];

        const result = computeVoronoiCells(duplicates, playAreaBbox);

        expect(result.features.length).toBe(1);
        expect(result.features[0].properties?.osmKey).toBe("node/1");
    });
});

describe("buildOsmMatchingHitMask", () => {
    it("returns the selected candidate's cell as hit mask", () => {
        const cells = computeVoronoiCells(mockCandidates, playAreaBbox);
        const hitMask = buildOsmMatchingHitMask(cells, "node/2");

        expect(hitMask.type).toBe("FeatureCollection");
        expect(hitMask.features.length).toBe(1);
        expect(hitMask.features[0].geometry.type).toBe("Polygon");
    });

    it("returns empty FeatureCollection when no selection", () => {
        const cells = computeVoronoiCells(mockCandidates, playAreaBbox);
        const hitMask = buildOsmMatchingHitMask(cells, null);

        expect(hitMask.features.length).toBe(0);
    });

    it("returns empty FeatureCollection for empty cells", () => {
        const hitMask = buildOsmMatchingHitMask(
            { features: [], type: "FeatureCollection" },
            "node/1",
        );

        expect(hitMask.features.length).toBe(0);
    });

    it("single candidate's cell covers entire bbox", () => {
        const singleCandidate = [mockCandidates[0]];
        const cells = computeVoronoiCells(singleCandidate, playAreaBbox);
        const hitMask = buildOsmMatchingHitMask(cells, "node/1");

        expect(hitMask.features.length).toBe(1);
        // With one point, the Voronoi cell is the entire bbox
        const coords = cells.features[0].geometry.coordinates[0];
        // Cell corners should match bbox corners
        const lons = coords.map(([lon]) => lon);
        const lats = coords.map(([, lat]) => lat);
        expect(Math.min(...lons)).toBeCloseTo(playAreaBbox[0], 5);
        expect(Math.min(...lats)).toBeCloseTo(playAreaBbox[1], 5);
        expect(Math.max(...lons)).toBeCloseTo(playAreaBbox[2], 5);
        expect(Math.max(...lats)).toBeCloseTo(playAreaBbox[3], 5);
    });

    it("distinguishes same numeric osmId across different element types", () => {
        const cells = computeVoronoiCells(
            mockCandidatesWithTypeCollision,
            playAreaBbox,
        );

        // node/1 and way/1 should produce two different cells
        expect(cells.features.length).toBe(2);

        const hitNode = buildOsmMatchingHitMask(cells, "node/1");
        const hitWay = buildOsmMatchingHitMask(cells, "way/1");

        expect(hitNode.features.length).toBe(1);
        expect(hitWay.features.length).toBe(1);
        expect(hitNode.features[0].properties?.osmKey).toBe("node/1");
        expect(hitWay.features[0].properties?.osmKey).toBe("way/1");
    });
});

describe("buildOsmMatchingMissMask", () => {
    it("returns union of non-selected cells as miss mask", () => {
        const cells = computeVoronoiCells(mockCandidates, playAreaBbox);
        const missMask = buildOsmMatchingMissMask(cells, "node/2");

        expect(missMask.type).toBe("FeatureCollection");
        expect(missMask.features.length).toBe(1);
        expect(missMask.features[0].geometry.type).toBe("Polygon");
    });

    it("returns all cells when no selection is made", () => {
        const cells = computeVoronoiCells(mockCandidates, playAreaBbox);
        const missMask = buildOsmMatchingMissMask(cells, null);

        // With no selection, all cells are "other" → union of all
        expect(missMask.features.length).toBe(1);
        expect(missMask.features[0].geometry.type).toBe("Polygon");
    });

    it("returns empty FeatureCollection for single candidate", () => {
        const singleCandidate = [mockCandidates[0]];
        const cells = computeVoronoiCells(singleCandidate, playAreaBbox);
        const missMask = buildOsmMatchingMissMask(cells, "node/1");

        // Only one cell and it's selected → no miss mask
        expect(missMask.features.length).toBe(0);
    });

    it("returns empty FeatureCollection for empty cells", () => {
        const missMask = buildOsmMatchingMissMask(
            { features: [], type: "FeatureCollection" },
            "node/1",
        );

        expect(missMask.features.length).toBe(0);
    });

    it("distinguishes same numeric osmId across different element types in miss mask", () => {
        const cells = computeVoronoiCells(
            mockCandidatesWithTypeCollision,
            playAreaBbox,
        );

        const missNode = buildOsmMatchingMissMask(cells, "node/1");
        const missWay = buildOsmMatchingMissMask(cells, "way/1");

        expect(missNode.features.length).toBe(1);
        expect(missWay.features.length).toBe(1);
        expect(missNode.features[0].properties?.osmKey).toBe("way/1");
        expect(missWay.features[0].properties?.osmKey).toBe("node/1");
    });
});
