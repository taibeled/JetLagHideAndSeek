import type { RadarQuestion } from "@/features/questions/radar/radarTypes";
import type { TransitLineQuestion } from "@/features/questions/transitLine/transitLineTypes";

export type {
    BaseQuestion,
    ImplementedQuestionType,
    QuestionAnswer,
    QuestionAnswerLabels,
    QuestionType,
} from "@/features/questions/coreTypes";

export type QuestionState = RadarQuestion | TransitLineQuestion;
export type QuestionsImportState = QuestionState[];
