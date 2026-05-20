import type { RadarQuestion } from "@/features/questions/radar/radarTypes";

export type QuestionType =
    | "radar"
    | "matching"
    | "measuring"
    | "thermometer"
    | "tentacles";

export type ImplementedQuestionType = "radar";

export type QuestionAnswer = "unanswered" | "positive" | "negative";

export type QuestionAnswerLabels = Record<
    Exclude<QuestionAnswer, "unanswered">,
    string
>;

export type BaseQuestion = {
    createdAt: string;
    id: string;
    type: QuestionType;
    updatedAt: string;
};

export type QuestionState = RadarQuestion;
export type QuestionsImportState = QuestionState[];
