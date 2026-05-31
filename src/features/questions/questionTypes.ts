import type { MatchingQuestion } from "@/features/questions/matching/matchingTypes";
import type { RadarQuestion } from "@/features/questions/radar/radarTypes";

export type {
    BaseQuestion,
    ImplementedQuestionType,
    QuestionAnswer,
    QuestionAnswerLabels,
    QuestionType,
} from "@/features/questions/coreTypes";

export type QuestionState = RadarQuestion | MatchingQuestion;
export type QuestionsImportState = QuestionState[];
