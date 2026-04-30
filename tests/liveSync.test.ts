import { describe, expect, it } from "vitest";

import { isHydrating, setHydrating } from "@/lib/liveSync";

describe("liveSync hydration gate", () => {
    it("setHydrating toggles exported flag", () => {
        setHydrating(true);
        expect(isHydrating).toBe(true);
        setHydrating(false);
        expect(isHydrating).toBe(false);
    });
});
