import type { QuestionDefinition } from "@/features/questions/questionRegistry";

export const tentaclesQuestionConfig = {
    answerMapBehavior: {
        negative: "none",
        positive: "none",
    },
    answerLabels: {
        negative: "Miss",
        positive: "Hit",
    },
    cost: "Draw 4, pick 2",
    defaultAnswer: "unanswered",
    detail: "Find the closest qualifying place within range.",
    implemented: false,
    listTitle: "Tentacles",
    mapBehavior: { usesMovableAnchor: true },
    summary: () => "Not yet implemented",
    time: "5 minutes",
    title: "Tentacles",
    type: "tentacles",
} satisfies QuestionDefinition;
