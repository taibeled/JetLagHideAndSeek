import { describe, expect, it } from "vitest";

import { matchingQuestionSchema } from "@/maps/schema";

describe("same-train-line matching schema", () => {
    it("preserves selected train line fields", () => {
        const question = matchingQuestionSchema.parse({
            type: "same-train-line",
            lat: 35.681236,
            lng: 139.767125,
            selectedTrainLineId: "relation/123",
            selectedTrainLineLabel: "Yamanote Line",
        });

        expect(question).toMatchObject({
            type: "same-train-line",
            selectedTrainLineId: "relation/123",
            selectedTrainLineLabel: "Yamanote Line",
        });
    });

    it("accepts legacy same-train-line questions without selected train line fields", () => {
        const question = matchingQuestionSchema.parse({
            type: "same-train-line",
            lat: 35.681236,
            lng: 139.767125,
        });

        expect(question.type).toBe("same-train-line");
        if (question.type !== "same-train-line") {
            throw new Error("Expected same-train-line question");
        }
        expect(question.selectedTrainLineId).toBeUndefined();
        expect(question.selectedTrainLineLabel).toBeUndefined();
    });

    it("rejects selected train line ids that are not exact ways or relations", () => {
        expect(() =>
            matchingQuestionSchema.parse({
                type: "same-train-line",
                lat: 35.681236,
                lng: 139.767125,
                selectedTrainLineId: "network=TfL",
            }),
        ).toThrow();
        expect(() =>
            matchingQuestionSchema.parse({
                type: "same-train-line",
                lat: 35.681236,
                lng: 139.767125,
                selectedTrainLineId: "node/123",
            }),
        ).toThrow();
    });

    it("rejects empty selectedTrainLineId", () => {
        expect(() =>
            matchingQuestionSchema.parse({
                type: "same-train-line",
                lat: 35.681236,
                lng: 139.767125,
                selectedTrainLineId: "",
            }),
        ).toThrow();
    });

    it("rejects selectedTrainLineId without way/ or relation/ prefix", () => {
        expect(() =>
            matchingQuestionSchema.parse({
                type: "same-train-line",
                lat: 35.681236,
                lng: 139.767125,
                selectedTrainLineId: "12345",
            }),
        ).toThrow();
    });

    it("accepts way/ prefixed selectedTrainLineId", () => {
        const question = matchingQuestionSchema.parse({
            type: "same-train-line",
            lat: 35.681236,
            lng: 139.767125,
            selectedTrainLineId: "way/999",
            selectedTrainLineLabel: "My Way",
        });

        expect(question).toMatchObject({
            type: "same-train-line",
            selectedTrainLineId: "way/999",
            selectedTrainLineLabel: "My Way",
        });
    });

    it("accepts selectedTrainLineId without selectedTrainLineLabel", () => {
        const question = matchingQuestionSchema.parse({
            type: "same-train-line",
            lat: 35.681236,
            lng: 139.767125,
            selectedTrainLineId: "relation/1",
        });

        expect(question).toMatchObject({
            type: "same-train-line",
            selectedTrainLineId: "relation/1",
        });
        if (question.type === "same-train-line") {
            expect(question.selectedTrainLineLabel).toBeUndefined();
        }
    });
});
