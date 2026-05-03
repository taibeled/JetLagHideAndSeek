import { describe, expect, test } from "vitest";

import { computeSidFromCanonicalUtf8, SID_PATTERN } from "../src/sid.js";

describe("computeSidFromCanonicalUtf8", () => {
    test("returns a stable 22-character SID for a known canonical string", () => {
        const sid = computeSidFromCanonicalUtf8("hello world");
        expect(sid.length).toBe(22);
        expect(SID_PATTERN.test(sid)).toBe(true);
        expect(sid).toBe("uU0nuZNNPgilLlLX2n2r-g");
    });

    test("returns the same SID when called twice with the same input", () => {
        const s1 = computeSidFromCanonicalUtf8("hello world");
        const s2 = computeSidFromCanonicalUtf8("hello world");
        expect(s1).toBe(s2);
    });

    test("returns different SIDs for different inputs", () => {
        const s1 = computeSidFromCanonicalUtf8("hello");
        const s2 = computeSidFromCanonicalUtf8("world");
        expect(s1).not.toBe(s2);
    });
});

describe("SID_PATTERN", () => {
    test("matches a valid SID produced by computeSidFromCanonicalUtf8", () => {
        const sid = computeSidFromCanonicalUtf8("hello world");
        expect(SID_PATTERN.test(sid)).toBe(true);
    });

    test("matches exactly 22 alphanumeric, dash, and underscore characters", () => {
        expect(SID_PATTERN.test("abcdefghijklmnopqrstuv")).toBe(true);
    });

    test("rejects strings that are too short", () => {
        expect(SID_PATTERN.test("abc")).toBe(false);
    });

    test("rejects strings that are too long", () => {
        expect(SID_PATTERN.test("abcdefghijklmnopqrstuvw")).toBe(false);
    });

    test("rejects strings containing invalid characters", () => {
        expect(SID_PATTERN.test("..abcdefghijklmnopqrst")).toBe(false);
    });
});
