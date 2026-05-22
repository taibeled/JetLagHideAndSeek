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
    detail: "Compare nearest places or boundaries.",
    implemented: true,
    listTitle: "Matching",
    mapBehavior: { usesMovableAnchor: false },
    summary: (question) =>
        question.type === "matching" && question.lineName
            ? `Transit line: ${question.lineName}`
            : "Transit line: not selected",
    time: "5 minutes",
    title: "Matching",
    type: "matching",
} satisfies QuestionDefinition;
