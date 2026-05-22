import {
    getQuestionAnswerLabel,
    implementedQuestionTypes,
    questionDefinitions,
} from "@/features/questions/questionRegistry";
import type { QuestionType } from "@/features/questions/questionTypes";

describe("questionRegistry", () => {
    it("has config for every planned question type", () => {
        const questionTypes: QuestionType[] = [
            "matching",
            "measuring",
            "radar",
            "tentacles",
            "thermometer",
        ];

        expect(Object.keys(questionDefinitions).sort()).toEqual(
            questionTypes.sort(),
        );
    });

    it("exposes implemented question types", () => {
        expect(implementedQuestionTypes).toEqual(["matching", "radar"]);
    });

    it("resolves answer labels per question type", () => {
        expect(getQuestionAnswerLabel("radar", "positive")).toBe("Hit");
        expect(getQuestionAnswerLabel("radar", "negative")).toBe("Miss");
        expect(getQuestionAnswerLabel("thermometer", "positive")).toBe(
            "Warmer",
        );
        expect(getQuestionAnswerLabel("thermometer", "negative")).toBe(
            "Colder",
        );
        expect(getQuestionAnswerLabel("radar", "unanswered")).toBe(
            "Unanswered",
        );
    });

    it("keeps radar answer defaults and map semantics in config", () => {
        expect(questionDefinitions.radar.defaultAnswer).toBe("unanswered");
        expect(questionDefinitions.radar.answerMapBehavior).toEqual({
            negative: "darken-inside",
            positive: "darken-outside",
        });
    });
});
