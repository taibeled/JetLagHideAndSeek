import type { QuestionDefinition } from "@/features/questions/questionRegistry";
import { getCategoryTitle } from "./matchingCategories";

export const matchingQuestionConfig = {
    answerMapBehavior: {
        negative: "none",
        positive: "none",
    },
    answerLabels: {
        negative: "Miss",
        positive: "Hit",
    },
    cost: "Draw 2, pick 1",
    defaultAnswer: "unanswered",
    detail: "Compare nearest candidates from a movable map pin.",
    implemented: true,
    listTitle: "Matching",
    mapBehavior: { usesMovableAnchor: true },
    summary: (question) => {
        if (question.type !== "matching") return "";
        const categoryTitle = getCategoryTitle(question.category);
        if (question.category === "transit-line") {
            return question.lineName
                ? `Transit line: ${question.lineName}`
                : "Transit line: not selected";
        }
        if (question.category === "station-name-length") {
            if (!question.targetName) {
                return `${categoryTitle}: not selected`;
            }
            // Show the station name and its English-name character count.
            const nameLen = question.candidates.find(
                (c) => c.osmId === question.selectedOsmId,
            )?.nameLength;
            const suffix = nameLen !== undefined ? ` (${nameLen} chars)` : "";
            return `${categoryTitle}: ${question.targetName}${suffix}`;
        }
        return question.targetName
            ? `${categoryTitle}: ${question.targetName}`
            : `${categoryTitle}: not selected`;
    },
    time: "5 minutes",
    title: "Matching",
    type: "matching",
} satisfies QuestionDefinition;
