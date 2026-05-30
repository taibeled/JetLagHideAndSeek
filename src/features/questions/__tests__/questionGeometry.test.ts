import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import { buildQuestionMapRenderState } from "@/features/questions/questionGeometry";
import {
    getTransitLineOptions,
    reconcileTransitLineQuestionSelection,
} from "@/features/questions/transitLine/transitLineQuestion";
import type { TransitLineQuestion } from "@/features/questions/transitLine/transitLineTypes";

const HIBIYA_LINE_ID = "gtfs:odpt-tokyo-metro:route:3";
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
    center: [139.72214, 35.65121],
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "matching-1",
    lineId: null,
    lineName: null,
    type: "matching",
    updatedAt: "2026-05-30T00:00:00.000Z",
};

describe("buildQuestionMapRenderState transit line masks", () => {
    it("cannot build a hit mask when an answer has no selected line", () => {
        const renderState = buildQuestionMapRenderState(
            [question],
            stations,
            600,
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
        const hitState = buildQuestionMapRenderState([selected], stations, 600);
        const missState = buildQuestionMapRenderState(
            [{ ...selected, answer: "negative" }],
            stations,
            600,
        );

        expect(selected.lineId).toBe(HIBIYA_LINE_ID);
        expect(hitState.transitLine.hitMaskFeatures.features).toHaveLength(1);
        expect(missState.transitLine.missMaskFeatures.features).toHaveLength(1);
    });
});
