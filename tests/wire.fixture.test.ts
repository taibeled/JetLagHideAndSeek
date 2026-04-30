import { describe, expect, it } from "vitest";

import wireFixture from "./fixtures/wire-v1.json";
import { computeSidFromCanonicalUtf8 } from "@/lib/cas";
import { canonicalize, wireV1SnapshotSchema } from "@/lib/wire";

describe("wire v1 fixture sid lock", () => {
    it("matches canonical sid for bundled fixture", async () => {
        const snap = wireV1SnapshotSchema.parse(wireFixture);
        const canonicalUtf8 = canonicalize(snap);
        const sid = await computeSidFromCanonicalUtf8(canonicalUtf8);
        expect(sid).toBe("9Tt79VmedVVPOG5Z83f36Q");
    });
});
