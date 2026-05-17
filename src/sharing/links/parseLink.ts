import type { ImportLinkError } from "@/sharing/errors";
import { decodeEnvelopePayload } from "@/sharing/wire/codec";
import type { WireEnvelope } from "@/sharing/wire/schema";

export type ParsedImportLink =
    | { envelope: WireEnvelope; ok: true; source: "payload" }
    | { error: ImportLinkError; ok: false };

export type ParsedImportPayload =
    | { envelope: WireEnvelope; ok: true }
    | { error: ImportLinkError; ok: false };

export function parseImportLink(url: string): ParsedImportLink {
    const payload = extractPayload(url);
    if (!payload) return { error: { code: "missing-payload" }, ok: false };
    const decoded = decodeEnvelopePayload(payload);
    if (!decoded.ok) return decoded;
    return { envelope: decoded.envelope, ok: true, source: "payload" };
}

export function parseImportPayload(
    payload: string | string[] | undefined,
): ParsedImportPayload {
    if (!payload || Array.isArray(payload)) {
        return { error: { code: "missing-payload" }, ok: false };
    }
    return decodeEnvelopePayload(payload);
}

function extractPayload(url: string): string | null {
    try {
        const parsed = new URL(url);
        return parsed.searchParams.get("d");
    } catch {
        const match = /(?:[?&]d=)([^&]+)/.exec(url);
        return match ? decodeURIComponent(match[1]) : null;
    }
}
