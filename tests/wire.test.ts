import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/wire";

describe("canonicalize", () => {
    it("sorts object keys and ignores undefined", () => {
        const a = canonicalize({ z: 1, a: { m: 2, b: 1 }, u: undefined });
        const b = canonicalize({ a: { b: 1, m: 2 }, z: 1 });
        expect(a).toBe(b);
        expect(JSON.parse(a)).toEqual({ a: { b: 1, m: 2 }, z: 1 });
    });

    it("preserves array order", () => {
        expect(JSON.parse(canonicalize({ x: [3, 2, 1] }))).toEqual({
            x: [3, 2, 1],
        });
    });

    it("preserves selectedTrainLineId in canonical output", () => {
        const question = {
            type: "same-train-line",
            lat: 35.6,
            lng: 139.7,
            selectedTrainLineId: "relation/123",
            selectedTrainLineLabel: "Yamanote Line",
            same: true,
        };

        const result = JSON.parse(canonicalize(question));
        expect(result.selectedTrainLineId).toBe("relation/123");
        expect(result.selectedTrainLineLabel).toBe("Yamanote Line");
    });

    it("omits undefined selectedTrainLineId from canonical output", () => {
        const question = {
            type: "same-train-line",
            lat: 35.6,
            lng: 139.7,
            selectedTrainLineId: undefined,
            selectedTrainLineLabel: undefined,
            same: true,
        };

        const result = JSON.parse(canonicalize(question));
        expect(result).not.toHaveProperty("selectedTrainLineId");
        expect(result).not.toHaveProperty("selectedTrainLineLabel");
    });
});
