import type { QuestionDefinition } from "@/features/questions/questionRegistry";

export const thermometerQuestionConfig = {
    answerMapBehavior: {
        negative: "none",
        positive: "none",
    },
    answerLabels: {
        negative: "Colder",
        positive: "Warmer",
    },
    cost: "Draw 2, pick 1",
    defaultAnswer: "unanswered",
    detail: "Compare whether movement is hotter or colder.",
    implemented: false,
    listTitle: "Thermometer",
    mapBehavior: { usesMovableAnchor: false },
    summary: () => "Not yet implemented",
    time: "5 minutes",
    title: "Thermometer",
    type: "thermometer",
} satisfies QuestionDefinition;
