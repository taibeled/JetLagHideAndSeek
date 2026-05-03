import { describe, expect, it } from "vitest";

import radiusFixture from "./fixtures/wire-radius.json";
import thermometerFixture from "./fixtures/wire-thermometer.json";
import trainLineFixture from "./fixtures/wire-same-train-line.json";
import multiFixture from "./fixtures/wire-multi-question.json";
import wireFixture from "./fixtures/wire-v1.json";
import { computeSidFromCanonicalUtf8 } from "@/lib/cas";
import { canonicalize, wireV1SnapshotSchema } from "@/lib/wire";

async function sidFor(fixture: unknown): Promise<string> {
    const snap = wireV1SnapshotSchema.parse(fixture);
    const canonicalUtf8 = canonicalize(snap);
    return computeSidFromCanonicalUtf8(canonicalUtf8);
}

describe("wire v1 fixture sid lock", () => {
    it("matches canonical sid for bundled fixture", async () => {
        const snap = wireV1SnapshotSchema.parse(wireFixture);
        const canonicalUtf8 = canonicalize(snap);
        const sid = await computeSidFromCanonicalUtf8(canonicalUtf8);
        expect(sid).toBe("9Tt79VmedVVPOG5Z83f36Q");
    });

    it("matches canonical sid for radius fixture", async () => {
        const sid = await sidFor(radiusFixture);
        expect(sid).toBe("FjJR7lVDiof3bqCfWZT0tw");
    });

    it("matches canonical sid for thermometer fixture", async () => {
        const sid = await sidFor(thermometerFixture);
        expect(sid).toBe("RE2yin-LsxLvRlRm23A4Cg");
    });

    it("matches canonical sid for same-train-line fixture", async () => {
        const sid = await sidFor(trainLineFixture);
        expect(sid).toBe("QWqOSmJgMCdhsSoqtngdEg");
    });

    it("matches canonical sid for multi-question fixture", async () => {
        const sid = await sidFor(multiFixture);
        expect(sid).toBe("kojxhwq5d5_OvjR0rxHm9g");
    });
});
