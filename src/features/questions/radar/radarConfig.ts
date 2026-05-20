import type { QuestionDefinition } from "@/features/questions/questionRegistry";

const answerLabels = {
    negative: "Miss",
    positive: "Hit",
} as const;

export const radarQuestionConfig = {
    answerMapBehavior: {
        negative: "darken-inside",
        positive: "darken-outside",
    },
    answerLabels,
    cost: "Draw 2, pick 1",
    defaultAnswer: "unanswered",
    detail: "Ask whether the hider is within a distance of you.",
    implemented: true,
    listTitle: "Radar",
    mapBehavior: { usesMovableAnchor: true },
    summary: (question) =>
        question.type === "radar"
            ? [
                  `${Math.round(question.distanceMeters)} m distance`,
                  question.answer === "unanswered"
                      ? null
                      : answerLabels[question.answer],
              ]
                  .filter(Boolean)
                  .join(" · ")
            : "",
    time: "5 minutes",
    title: "Radar Question",
    type: "radar",
} satisfies QuestionDefinition;
