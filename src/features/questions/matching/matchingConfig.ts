import type { QuestionDefinition } from "@/features/questions/questionRegistry";

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
    detail: "Compare a candidate transit line from a movable map pin.",
    implemented: true,
    listTitle: "Transit Line",
    mapBehavior: { usesMovableAnchor: true },
    summary: (question) =>
        question.type === "matching" && question.lineName
            ? `Transit line: ${question.lineName}`
            : "Transit line: not selected",
    time: "5 minutes",
    title: "Transit Line",
    type: "matching",
} satisfies QuestionDefinition;
