import type { TransitLineQuestion } from "@/features/questions/transitLine/transitLineTypes";
import { isCanonicalTransitRouteId } from "@/features/transit/transitIdentity";

export function normalizeTransitLineQuestion(
    question: TransitLineQuestion,
): TransitLineQuestion {
    if (
        question.lineId === null ||
        isCanonicalTransitRouteId(question.lineId)
    ) {
        return question;
    }

    return {
        ...question,
        answer: "unanswered",
        lineId: null,
        lineName: null,
    };
}
