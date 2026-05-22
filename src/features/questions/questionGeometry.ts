import type { QuestionMapRenderState } from "@/features/questions/radar/radarTypes";
import { buildRadarQuestionRenderState } from "@/features/questions/radar/radarGeometry";
import type { QuestionState } from "@/features/questions/questionTypes";
import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import { buildTransitLineMaskFeatures } from "@/features/questions/transitLine/transitLineQuestion";

export function buildQuestionMapRenderState(
    questions: QuestionState[],
    stations: TransitStation[],
    radiusMeters: number,
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
