import type { RadarQuestion } from "@/features/questions/radar/radarTypes";
import type { TransitLineQuestion } from "@/features/questions/transitLine/transitLineTypes";

export type QuestionType =
    | "radar"
    | "matching"
    | "measuring"
    | "thermometer"
    | "tentacles";

export type ImplementedQuestionType = "radar" | "matching";

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

export type QuestionState = RadarQuestion | TransitLineQuestion;
export type QuestionsImportState = QuestionState[];
