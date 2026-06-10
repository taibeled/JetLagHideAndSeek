/**
 * Game-slot URL → storage-namespace contract. Every persistent atom's
 * localStorage key derives from this, so a behavior change here silently
 * remaps (i.e. appears to wipe) users' saved games — pin it.
 */
import { describe, expect, it } from "vitest";

import { resolveGameSlot, sanitizeGameSlot } from "@/lib/game-slot";

describe("game-slot", () => {
    it("no ?game param → null (default unprefixed keys, existing saves intact)", () => {
        expect(resolveGameSlot("")).toBeNull();
        expect(resolveGameSlot("?foo=bar")).toBeNull();
    });

    it("resolves a simple slot", () => {
        expect(resolveGameSlot("?game=saturday")).toBe("saturday");
        expect(resolveGameSlot("?foo=1&game=nyc-game-2")).toBe("nyc-game-2");
    });

    it("sanitizes to lowercase alnum/dash/underscore", () => {
        expect(sanitizeGameSlot("Saturday Game!")).toBe("saturday-game");
        expect(sanitizeGameSlot("6-13-ab3x")).toBe("6-13-ab3x");
        expect(sanitizeGameSlot("  --  ")).toBeNull();
        expect(sanitizeGameSlot("")).toBeNull();
        expect(sanitizeGameSlot(null)).toBeNull();
    });

    it("caps slot length", () => {
        const long = "x".repeat(100);
        expect(sanitizeGameSlot(long)!.length).toBeLessThanOrEqual(40);
    });

    it("garbage param falls back to default rather than a junk namespace", () => {
        expect(resolveGameSlot("?game=%%%")).toBeNull();
        expect(resolveGameSlot("?game=")).toBeNull();
    });
});
