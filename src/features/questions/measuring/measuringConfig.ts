import type { QuestionDefinition } from "@/features/questions/questionRegistry";

export const measuringQuestionConfig = {
    answerMapBehavior: {
        negative: "none",
        positive: "none",
    },
    answerLabels: {
        negative: "Miss",
        positive: "Hit",
    },
    cost: "Draw 3, pick 1",
    defaultAnswer: "unanswered",
    detail: "Compare distance to a selected place or boundary.",
    implemented: false,
    listTitle: "Measuring",
    mapBehavior: { usesMovableAnchor: false },
    summary: () => "Not yet implemented",
    time: "5 minutes",
    title: "Measuring",
    type: "measuring",
} satisfies QuestionDefinition;
