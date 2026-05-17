import { base64UrlToBytes, bytesToBase64Url } from "@/sharing/wire/base64url";
import { canonicalize } from "@/sharing/wire/canonicalize";
import { decodeEnvelopePayload, encodeEnvelope } from "@/sharing/wire/codec";
import type { AppStateEnvelopeV1 } from "@/sharing/wire/schema";

const envelope: AppStateEnvelopeV1 = {
    kind: "app-state",
    payload: {
        gameId: "game-1",
        hidingZones: {
            radiusMeters: 600,
            radiusUnit: "m",
            selectedPresetIds: ["tokyo-metro"],
        },
        metadata: {
            createdAt: "2026-05-17T00:00:00.000Z",
            updatedAt: "2026-05-17T00:00:00.000Z",
        },
        playArea: {
            bbox: [1, 2, 3, 4],
            boundary: { features: [], type: "FeatureCollection" },
            center: [2, 3],
            label: "Test Area",
            osmId: 123,
            osmType: "R",
        },
    },
    version: 1,
};

describe("sharing wire codec", () => {
    it("canonicalizes objects with sorted keys and strips undefined", () => {
        expect(canonicalize({ b: 1, a: { d: undefined, c: 2 } })).toBe(
            '{"a":{"c":2},"b":1}',
        );
    });

    it("round trips base64url bytes", () => {
        const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253]);
        const encoded = bytesToBase64Url(bytes);

        expect(encoded).not.toContain("+");
        expect(encoded).not.toContain("/");
        expect(encoded).not.toContain("=");
        expect(base64UrlToBytes(encoded)).toEqual(bytes);
    });

    it("encodes and decodes an app-state envelope", () => {
        const payload = encodeEnvelope(envelope);
        const decoded = decodeEnvelopePayload(payload);

        expect(decoded).toEqual({ envelope, ok: true });
    });

    it("returns a structured error for invalid payloads", () => {
        expect(decodeEnvelopePayload("not*base64")).toEqual({
            error: { code: "invalid-base64url" },
            ok: false,
        });
    });
});
