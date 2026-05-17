import { inflateSync, strFromU8 } from "fflate";

import { base64UrlToBytes, bytesToBase64Url } from "@/sharing/wire/base64url";
import { canonicalize } from "@/sharing/wire/canonicalize";
import { decodeEnvelopePayload, encodeEnvelope } from "@/sharing/wire/codec";
import { FIELD_MAP } from "@/sharing/wire/minified";
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

        expect(decoded.ok).toBe(true);
        if (decoded.ok) {
            expect(decoded.envelope.kind).toBe("app-state");
            expect(decoded.envelope.version).toBe(1);
            expect(decoded.envelope.payload.gameId).toBe("game-1");
            expect(decoded.envelope.payload.playArea?.label).toBe("Test Area");
            expect(decoded.envelope.payload.playArea?.osmId).toBe(123);
        }
    });

    it("returns a structured error for invalid payloads", () => {
        expect(decodeEnvelopePayload("not*base64")).toEqual({
            error: { code: "invalid-base64url" },
            ok: false,
        });
    });

    it("encodes using minified keys", () => {
        const payload = encodeEnvelope(envelope);
        const raw = strFromU8(inflateSync(base64UrlToBytes(payload)));
        const json = JSON.parse(raw);

        expect(json[FIELD_MAP.kind]).toBe("app-state");
        expect(json[FIELD_MAP.version]).toBe(1);
        expect(json[FIELD_MAP.payload][FIELD_MAP.gameId]).toBe("game-1");
        expect(
            json[FIELD_MAP.payload][FIELD_MAP.metadata][FIELD_MAP.createdAt],
        ).toBe("2026-05-17T00:00:00.000Z");

        expect(json.kind).toBeUndefined();
        expect(json.version).toBeUndefined();
        expect(json.payload).toBeUndefined();
    });

    it("decoded envelope restores full-key format", () => {
        const payload = encodeEnvelope(envelope);
        const decoded = decodeEnvelopePayload(payload);

        expect(decoded.ok).toBe(true);
        if (decoded.ok) {
            const result = decoded.envelope;
            expect(result.kind).toBe("app-state");
            expect(result.payload.hidingZones?.radiusMeters).toBe(600);
            expect(result.payload.hidingZones?.radiusUnit).toBe("m");
            expect(result.payload.metadata.updatedAt).toBe(
                result.payload.metadata.createdAt,
            );
            expect(result.payload.playArea?.osmType).toBe("R");
        }
    });
});
