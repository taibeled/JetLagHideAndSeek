import { describe, expect, test } from "vitest";

import {
    expandFiltersForOperatorNetwork,
    normalizeOsmText,
} from "./operators-tags";

describe("normalizeOsmText", () => {
    test("returns trimmed string for non-empty string input", () => {
        expect(normalizeOsmText("  hello  ")).toBe("hello");
    });

    test("returns undefined for empty string", () => {
        expect(normalizeOsmText("")).toBeUndefined();
    });

    test("returns undefined for whitespace-only string", () => {
        expect(normalizeOsmText("   ")).toBeUndefined();
    });

    test("returns undefined for non-string values", () => {
        expect(normalizeOsmText(123)).toBeUndefined();
        expect(normalizeOsmText(null)).toBeUndefined();
        expect(normalizeOsmText(undefined)).toBeUndefined();
        expect(normalizeOsmText(true)).toBeUndefined();
    });

    test("does NOT lowercase output", () => {
        expect(normalizeOsmText("HELLO")).toBe("HELLO");
    });
});

describe("expandFiltersForOperatorNetwork", () => {
    test("returns baseFilter and alternatives unchanged with empty operatorFilter", () => {
        const result = expandFiltersForOperatorNetwork("base", ["alt1", "alt2"], []);
        expect(result).toEqual({
            primaryLines: ["base"],
            alternativeLines: ["alt1", "alt2"],
        });
    });

    test("adds operator and network regex clauses with single operator", () => {
        const result = expandFiltersForOperatorNetwork("base", ["alt"], ["JR East"]);
        expect(result.primaryLines).toHaveLength(2);
        expect(result.alternativeLines).toHaveLength(2);

        expect(result.primaryLines.some((l) => l.includes("[operator"))).toBe(true);
        expect(result.primaryLines.some((l) => l.includes("[network"))).toBe(true);
        for (const line of result.primaryLines) {
            expect(line).toContain("JR East");
        }
        for (const line of result.alternativeLines) {
            expect(line).toContain("JR East");
        }
    });

    test("adds operator and network regex clauses with multiple operators", () => {
        const result = expandFiltersForOperatorNetwork(
            "base",
            ["alt"],
            ["JR East", "Tokyo Metro"],
        );

        expect(result.primaryLines).toHaveLength(2);
        expect(result.alternativeLines).toHaveLength(2);

        expect(result.primaryLines[0]).toContain("operator");
        expect(result.primaryLines[0]).toContain("JR East");
        expect(result.primaryLines[0]).toContain("Tokyo Metro");
        expect(result.primaryLines[1]).toContain("network");
        expect(result.primaryLines[1]).toContain("JR East");
        expect(result.primaryLines[1]).toContain("Tokyo Metro");

        expect(result.alternativeLines[0]).toContain("operator");
        expect(result.alternativeLines[0]).toContain("JR East");
        expect(result.alternativeLines[1]).toContain("network");
        expect(result.alternativeLines[1]).toContain("JR East");
        expect(result.alternativeLines[1]).toContain("Tokyo Metro");
    });

    test("escapes regex metacharacters in operator values", () => {
        const a = expandFiltersForOperatorNetwork("base", ["alt"], ["JR (East)"]);
        expect(a.primaryLines[0]).toContain("JR \\(East\\)");
        expect(a.primaryLines[1]).toContain("JR \\(East\\)");

        const b = expandFiltersForOperatorNetwork("base", ["alt"], ["Tokyo+Metro"]);
        expect(b.primaryLines[0]).toContain("Tokyo\\+Metro");
        expect(b.primaryLines[1]).toContain("Tokyo\\+Metro");
    });

    test("filters out empty and whitespace-only operatorFilter entries", () => {
        const result = expandFiltersForOperatorNetwork(
            "base",
            ["alt"],
            ["", "   ", "JR East"],
        );

        expect(result.primaryLines).toHaveLength(2);
        expect(result.primaryLines[0]).toContain("JR East");
        expect(result.primaryLines[0]).not.toContain("~\"^($)\"");
        expect(result.primaryLines[0]).not.toContain("~\"^(|");
    });
});
