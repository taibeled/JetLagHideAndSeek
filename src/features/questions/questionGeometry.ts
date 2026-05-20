import type { QuestionMapRenderState } from "@/features/questions/radar/radarTypes";
import { buildRadarQuestionRenderState } from "@/features/questions/radar/radarGeometry";
import type { QuestionState } from "@/features/questions/questionTypes";

export function buildQuestionMapRenderState(
    questions: QuestionState[],
): QuestionMapRenderState {
    const radar = buildRadarQuestionRenderState(questions);

    return {
        radar,
        radarAreaFeatures: radar.previewFeatures,
    };
}
