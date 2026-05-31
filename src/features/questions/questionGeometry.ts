import { useMemo } from "react";

import type { Bbox } from "@/features/map/geojsonTypes";
import type { QuestionMapRenderState } from "@/features/questions/radar/radarTypes";
import { buildRadarQuestionRenderState } from "@/features/questions/radar/radarGeometry";
import type { QuestionState } from "@/features/questions/questionTypes";
import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import { buildTransitLineMaskFeatures } from "@/features/questions/transitLine/transitLineQuestion";
import {
    useHidingZoneDerived,
    useHidingZoneState,
} from "@/state/hidingZoneStore";
import { usePlayArea } from "@/state/playAreaStore";
import { useQuestionState } from "@/state/questionStore";
import { buildOsmMatchingRenderState } from "./matching/osmMatchingGeometry";

export function buildQuestionMapRenderState(
    questions: QuestionState[],
    stations: TransitStation[],
    radiusMeters: number,
    playAreaBbox: Bbox,
): QuestionMapRenderState {
    const radar = buildRadarQuestionRenderState(questions);
    const matchingQuestions = questions.filter(
        (question): question is Extract<QuestionState, { type: "matching" }> =>
            question.type === "matching" && question.lineId !== null,
    );
    const hitLine =
        matchingQuestions.find((question) => question.answer === "positive") ??
        null;
    const missLine =
        matchingQuestions.find((question) => question.answer === "negative") ??
        null;

    return {
        osmMatching: buildOsmMatchingRenderState(questions, playAreaBbox),
        radar,
        radarAreaFeatures: radar.previewFeatures,
        transitLine: {
            hitMaskFeatures: buildTransitLineMaskFeatures(
                stations,
                hitLine?.lineId ?? null,
                radiusMeters,
            ),
            missMaskFeatures: buildTransitLineMaskFeatures(
                stations,
                missLine?.lineId ?? null,
                radiusMeters,
            ),
        },
    };
}

export function useQuestionMapRenderState(): QuestionMapRenderState {
    const { questions } = useQuestionState();
    const { radiusMeters } = useHidingZoneState();
    const { selectedStations } = useHidingZoneDerived();
    const { playArea } = usePlayArea();

    return useMemo(
        () =>
            buildQuestionMapRenderState(
                questions,
                selectedStations,
                radiusMeters,
                playArea.bbox,
            ),
        [questions, selectedStations, radiusMeters, playArea.bbox],
    );
}
