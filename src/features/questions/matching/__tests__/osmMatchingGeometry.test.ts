import type { Bbox } from "@/shared/geojson";
import { defaultPlayArea } from "@/features/map/playArea";
import type { MatchingQuestion } from "@/features/questions/matching/matchingTypes";
import { buildOsmMatchingRenderState } from "@/features/questions/matching/osmMatchingGeometry";

const playAreaBbox: Bbox = defaultPlayArea.bbox;

const mockCandidates: MatchingQuestion["candidates"] = [
    {
        distanceMeters: 150,
        lat: 35.681,
        lon: 139.761,
        name: "Nearest Park",
        osmId: 1,
        osmType: "node",
        tags: {},
    },
    {
        distanceMeters: 900,
        lat: 35.685,
        lon: 139.765,
        name: "Farther Park",
        osmId: 2,
        osmType: "way",
        tags: {},
    },
];

function makeMatchingQuestion(
    overrides: Partial<MatchingQuestion> = {},
): MatchingQuestion {
    return {
        answer: "unanswered",
        candidates: mockCandidates,
        category: "park",
        center: [139.761, 35.681],
        createdAt: "2026-05-30T00:00:00.000Z",
        id: "matching-osm-1",
        lineId: null,
        lineName: null,
        selectedOsmId: 1,
        selectedOsmType: "node",
        targetName: "Nearest Park",
        targetOsmId: 1,
        targetOsmType: "node",
        type: "matching",
        updatedAt: "2026-05-30T00:00:00.000Z",
        ...overrides,
    };
}

describe("buildOsmMatchingRenderState", () => {
    it("returns empty state when no OSM matching questions", () => {
        const result = buildOsmMatchingRenderState([], playAreaBbox);

        expect(result.hitMaskFeatures.features).toHaveLength(0);
        expect(result.missMaskFeatures.features).toHaveLength(0);
        expect(result.poiFeatures.features).toHaveLength(0);
    });

    it("returns empty state when OSM matching has no candidates", () => {
        const question = makeMatchingQuestion({ candidates: [] });
        const result = buildOsmMatchingRenderState([question], playAreaBbox);

        expect(result.hitMaskFeatures.features).toHaveLength(0);
        expect(result.missMaskFeatures.features).toHaveLength(0);
        expect(result.poiFeatures.features).toHaveLength(0);
    });

    it("returns empty state when OSM matching has no selection", () => {
        const question = makeMatchingQuestion({
            selectedOsmId: null,
            selectedOsmType: null,
            targetOsmId: null,
            targetOsmType: null,
        });
        const result = buildOsmMatchingRenderState([question], playAreaBbox);

        expect(result.hitMaskFeatures.features).toHaveLength(0);
        expect(result.missMaskFeatures.features).toHaveLength(0);
        expect(result.poiFeatures.features).toHaveLength(0);
    });

    it("excludes transit-line questions from OSM matching render state", () => {
        const question = makeMatchingQuestion({ category: "transit-line" });
        const result = buildOsmMatchingRenderState([question], playAreaBbox);

        expect(result.hitMaskFeatures.features).toHaveLength(0);
        expect(result.missMaskFeatures.features).toHaveLength(0);
        expect(result.poiFeatures.features).toHaveLength(0);
    });

    it("builds hit mask for positive-answered question", () => {
        const question = makeMatchingQuestion({ answer: "positive" });
        const result = buildOsmMatchingRenderState([question], playAreaBbox);

        expect(result.hitMaskFeatures.features).toHaveLength(1);
        expect(result.hitMaskFeatures.features[0].geometry.type).toBe(
            "Polygon",
        );
        expect(result.missMaskFeatures.features).toHaveLength(0);
    });

    it("builds miss mask for negative-answered question", () => {
        const question = makeMatchingQuestion({ answer: "negative" });
        const result = buildOsmMatchingRenderState([question], playAreaBbox);

        expect(result.hitMaskFeatures.features).toHaveLength(0);
        expect(result.missMaskFeatures.features).toHaveLength(1);
        expect(result.missMaskFeatures.features[0].geometry.type).toBe(
            "Polygon",
        );
    });

    it("builds poi features for all candidates with isSelected flag", () => {
        const question = makeMatchingQuestion({ answer: "unanswered" });
        const result = buildOsmMatchingRenderState([question], playAreaBbox);

        expect(result.poiFeatures.features).toHaveLength(2);
        const selected = result.poiFeatures.features.find(
            (f) => f.properties?.osmId === 1,
        );
        const unselected = result.poiFeatures.features.find(
            (f) => f.properties?.osmId === 2,
        );
        expect(selected?.properties?.isSelected).toBe(true);
        expect(unselected?.properties?.isSelected).toBe(false);
    });

    it("uses composite osmKey for hit/miss masks to avoid type/id collisions", () => {
        const question: MatchingQuestion = {
            answer: "positive",
            candidates: [
                {
                    distanceMeters: 150,
                    lat: 35.681,
                    lon: 139.761,
                    name: "Node 1",
                    osmId: 1,
                    osmType: "node",
                    tags: {},
                },
                {
                    distanceMeters: 900,
                    lat: 35.685,
                    lon: 139.765,
                    name: "Way 1",
                    osmId: 1,
                    osmType: "way",
                    tags: {},
                },
            ],
            category: "park",
            center: [139.761, 35.681],
            createdAt: "2026-05-30T00:00:00.000Z",
            id: "matching-osm-collision",
            lineId: null,
            lineName: null,
            selectedOsmId: 1,
            selectedOsmType: "way",
            targetName: "Way 1",
            targetOsmId: 1,
            targetOsmType: "way",
            type: "matching",
            updatedAt: "2026-05-30T00:00:00.000Z",
        };

        const result = buildOsmMatchingRenderState([question], playAreaBbox);

        // Should select the way/1 cell, not node/1
        expect(result.hitMaskFeatures.features).toHaveLength(1);
        expect(result.hitMaskFeatures.features[0].properties?.osmKey).toBe(
            "way/1",
        );
    });

    it("aggregates hit/miss masks from multiple questions", () => {
        const q1 = makeMatchingQuestion({
            id: "q1",
            answer: "positive",
            selectedOsmId: 1,
        });
        const q2 = makeMatchingQuestion({
            id: "q2",
            answer: "negative",
            selectedOsmId: 2,
        });
        const result = buildOsmMatchingRenderState([q1, q2], playAreaBbox);

        expect(result.hitMaskFeatures.features).toHaveLength(1);
        expect(result.missMaskFeatures.features).toHaveLength(1);
    });
});
