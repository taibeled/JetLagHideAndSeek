import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import { defaultPlayArea } from "@/features/map/playArea";
import { buildQuestionMapRenderState } from "@/features/questions/questionGeometry";
import type { MatchingQuestion } from "@/features/questions/matching/matchingTypes";
import {
    getTransitLineOptions,
    reconcileTransitLineQuestionSelection,
} from "@/features/questions/transitLine/transitLineQuestion";
import type { TransitLineQuestion } from "@/features/questions/transitLine/transitLineTypes";

const HIBIYA_LINE_ID = "gtfs:odpt-tokyo-metro:route:3";
const playAreaBbox = defaultPlayArea.bbox;
const stations: TransitStation[] = [
    {
        id: "hiroo",
        lat: 35.651499,
        lon: 139.722209,
        name: "Hiroo",
        routeIds: [HIBIYA_LINE_ID],
    },
    {
        id: "ebisu",
        lat: 35.64704,
        lon: 139.708701,
        name: "Ebisu",
        routeIds: [HIBIYA_LINE_ID],
    },
];
const question: TransitLineQuestion = {
    answer: "positive",
    candidates: [],
    category: "transit-line",
    center: [139.72214, 35.65121],
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "matching-1",
    lineId: null,
    lineName: null,
    selectedOsmId: null,
    selectedOsmType: null,
    targetName: null,
    targetOsmId: null,
    targetOsmType: null,
    type: "matching",
    updatedAt: "2026-05-30T00:00:00.000Z",
};

const osmQuestion: MatchingQuestion = {
    answer: "positive",
    candidates: [
        {
            distanceMeters: 150,
            lat: 35.681,
            lon: 139.761,
            name: "Park A",
            osmId: 1,
            osmType: "node",
            tags: {},
        },
        {
            distanceMeters: 900,
            lat: 35.685,
            lon: 139.765,
            name: "Park B",
            osmId: 2,
            osmType: "node",
            tags: {},
        },
    ],
    category: "park",
    center: [139.761, 35.681],
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "matching-osm-1",
    lineId: null,
    lineName: null,
    selectedOsmId: 1,
    selectedOsmType: "node",
    targetName: "Park A",
    targetOsmId: 1,
    targetOsmType: "node",
    type: "matching",
    updatedAt: "2026-05-30T00:00:00.000Z",
};

describe("buildQuestionMapRenderState transit line masks", () => {
    it("cannot build a hit mask when an answer has no selected line", () => {
        const renderState = buildQuestionMapRenderState(
            [question],
            stations,
            600,
            playAreaBbox,
        );

        expect(renderState.transitLine.hitMaskFeatures.features).toEqual([]);
    });

    it("builds hit and miss masks after selecting the sole nearby line", () => {
        const options = getTransitLineOptions(
            stations,
            new Map([[HIBIYA_LINE_ID, "Hibiya Line"]]),
            question.center,
            600,
        );
        const selected = reconcileTransitLineQuestionSelection(
            question,
            options,
        );
        const hitState = buildQuestionMapRenderState(
            [selected],
            stations,
            600,
            playAreaBbox,
        );
        const missState = buildQuestionMapRenderState(
            [{ ...selected, answer: "negative" }],
            stations,
            600,
            playAreaBbox,
        );

        expect(selected.lineId).toBe(HIBIYA_LINE_ID);
        expect(hitState.transitLine.hitMaskFeatures.features).toHaveLength(1);
        expect(missState.transitLine.hitMaskFeatures.features).toHaveLength(0);
        expect(missState.transitLine.missMaskFeatures.features).toHaveLength(1);
    });
});

describe("buildQuestionMapRenderState OSM matching", () => {
    it("includes osmMatching hit mask for positive-answered OSM matching", () => {
        const renderState = buildQuestionMapRenderState(
            [osmQuestion],
            stations,
            600,
            playAreaBbox,
        );

        expect(renderState.osmMatching.hitMaskFeatures.features).toHaveLength(
            1,
        );
        expect(renderState.osmMatching.missMaskFeatures.features).toHaveLength(
            0,
        );
    });

    it("includes osmMatching miss mask for negative-answered OSM matching", () => {
        const renderState = buildQuestionMapRenderState(
            [{ ...osmQuestion, answer: "negative" }],
            stations,
            600,
            playAreaBbox,
        );

        expect(renderState.osmMatching.hitMaskFeatures.features).toHaveLength(
            0,
        );
        expect(renderState.osmMatching.missMaskFeatures.features).toHaveLength(
            1,
        );
    });

    it("includes poi features for OSM matching candidates", () => {
        const renderState = buildQuestionMapRenderState(
            [osmQuestion],
            stations,
            600,
            playAreaBbox,
        );

        expect(renderState.osmMatching.poiFeatures.features).toHaveLength(2);
    });

    it("excludes transit-line questions from osmMatching render state", () => {
        const renderState = buildQuestionMapRenderState(
            [question],
            stations,
            600,
            playAreaBbox,
        );

        expect(renderState.osmMatching.hitMaskFeatures.features).toHaveLength(
            0,
        );
        expect(renderState.osmMatching.missMaskFeatures.features).toHaveLength(
            0,
        );
        expect(renderState.osmMatching.poiFeatures.features).toHaveLength(0);
    });
});
