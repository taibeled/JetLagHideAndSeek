import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { ZodError } from "zod";

import type { ImportLinkError } from "@/sharing/errors";

import { base64UrlToBytes, bytesToBase64Url } from "./base64url";
import { canonicalize } from "./canonicalize";
import { wireEnvelopeSchema, type WireEnvelope } from "./schema";

export type DecodeEnvelopeResult =
    | { ok: true; envelope: WireEnvelope }
    | { error: ImportLinkError; ok: false };

export function encodeEnvelope(envelope: WireEnvelope): string {
    const validated = wireEnvelopeSchema.parse(envelope);
    const json = canonicalize(validated);
    return bytesToBase64Url(deflateSync(strToU8(json)));
}

export function decodeEnvelopePayload(payload: string): DecodeEnvelopeResult {
    let compressed: Uint8Array;
    try {
        compressed = base64UrlToBytes(payload);
    } catch {
        return { error: { code: "invalid-base64url" }, ok: false };
    }

    let json: string;
    try {
        json = strFromU8(inflateSync(compressed));
    } catch {
        return { error: { code: "inflate-failed" }, ok: false };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { error: { code: "invalid-json" }, ok: false };
    }

    const version = getUnsupportedVersion(parsed);
    if (version !== null) {
        return { error: { code: "unsupported-version", version }, ok: false };
    }

    try {
        return { envelope: wireEnvelopeSchema.parse(parsed), ok: true };
    } catch (err) {
        return {
            error: {
                code: "schema-invalid",
                details: err instanceof ZodError ? err.message : undefined,
            },
            ok: false,
        };
    }
}

function getUnsupportedVersion(value: unknown): number | null {
    if (!value || typeof value !== "object") return null;
    const version = (value as { version?: unknown }).version;
    if (typeof version === "number" && version !== 1) return version;
    return null;
}
