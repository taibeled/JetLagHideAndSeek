import { encodeEnvelope } from "@/sharing/wire/codec";
import type { WireEnvelope } from "@/sharing/wire/schema";

export type LinkMode = "custom-scheme" | "https";

export function buildImportLink({
    envelope,
    mode,
}: {
    envelope: WireEnvelope;
    mode: LinkMode;
}): string {
    const payload = encodeEnvelope(envelope);

    if (mode === "https") {
        throw new Error("HTTPS share links need a configured app link domain.");
    }

    return `jetlag-hide-seek-v2://import?d=${payload}`;
}
