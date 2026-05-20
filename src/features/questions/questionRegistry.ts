import { matchingQuestionConfig } from "@/features/questions/matching/matchingConfig";
import { measuringQuestionConfig } from "@/features/questions/measuring/measuringConfig";
import type {
    ImplementedQuestionType,
    QuestionAnswer,
    QuestionAnswerLabels,
    QuestionState,
    QuestionType,
} from "@/features/questions/questionTypes";
import { radarQuestionConfig } from "@/features/questions/radar/radarConfig";
import { tentaclesQuestionConfig } from "@/features/questions/tentacles/tentaclesConfig";
import { thermometerQuestionConfig } from "@/features/questions/thermometer/thermometerConfig";

export type QuestionDefinition = {
    answerMapBehavior: Record<
        Exclude<QuestionAnswer, "unanswered">,
        "darken-inside" | "darken-outside" | "none"
    >;
    answerLabels: QuestionAnswerLabels;
    cost: string;
    defaultAnswer: QuestionAnswer;
    detail: string;
    implemented: boolean;
    listTitle: string;
    mapBehavior: {
        usesMovableAnchor: boolean;
    };
    summary: (question: QuestionState, index: number) => string;
    time: string;
    title: string;
    type: QuestionType;
};

export const questionDefinitions = {
    matching: matchingQuestionConfig,
    measuring: measuringQuestionConfig,
    radar: radarQuestionConfig,
    tentacles: tentaclesQuestionConfig,
    thermometer: thermometerQuestionConfig,
} satisfies Record<QuestionType, QuestionDefinition>;

export const implementedQuestionTypes: ImplementedQuestionType[] =
    Object.values(questionDefinitions)
        .filter((definition) => definition.implemented)
        .map((definition) => definition.type as ImplementedQuestionType);

export function getQuestionDefinition(type: QuestionType): QuestionDefinition {
    return questionDefinitions[type];
}

export function getQuestionAnswerLabel(
    type: QuestionType,
    answer: QuestionAnswer,
): string {
    if (answer === "unanswered") return "Unanswered";
    return questionDefinitions[type].answerLabels[answer];
}
