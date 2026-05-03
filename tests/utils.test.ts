import { describe, expect, it } from "vitest";

import { cn, mapToObj } from "@/lib/utils";

describe("cn", () => {
    it("merges all truthy inputs", () => {
        const result = cn("px-4", "py-2");
        expect(result).toContain("px-4");
        expect(result).toContain("py-2");
    });

    it("ignores falsy values", () => {
        const result = cn("px-4", false, null, undefined, 0, "py-2");
        expect(result).toContain("px-4");
        expect(result).toContain("py-2");
        expect(result).not.toContain("false");
        expect(result).not.toContain("null");
        expect(result).not.toContain("undefined");
    });

    it("includes conditional truthy classes and excludes falsy ones", () => {
        const show = true;
        const hide = false;
        const result = cn("base", show && "active", hide && "hidden");
        expect(result).toContain("base");
        expect(result).toContain("active");
        expect(result).not.toContain("hidden");
    });

    it("resolves conflicting tailwind classes by keeping the last", () => {
        const result = cn("px-4", "px-2");
        expect(result).toContain("px-2");
        expect(result).not.toContain("px-4");
    });
});

describe("mapToObj", () => {
    it("maps an array to a key-value object", () => {
        expect(mapToObj([1, 2, 3], (n) => [String(n), n * 2])).toEqual({
            "1": 2,
            "2": 4,
            "3": 6,
        });
    });

    it("returns an empty object for an empty array", () => {
        expect(mapToObj([], () => ["", ""])).toEqual({});
    });

    it("handles string keys", () => {
        expect(mapToObj(["a", "b"], (s) => [s, s.toUpperCase()])).toEqual({
            a: "A",
            b: "B",
        });
    });
});
