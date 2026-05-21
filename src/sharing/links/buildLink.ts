import { encodeEnvelope } from "@/sharing/wire/codec";
import type { WireEnvelope } from "@/sharing/wire/schema";
import {
    buildCustomSchemeImportUrl,
    buildHttpsImportUrl,
} from "@/config/appLinks";

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
        return buildHttpsImportUrl(payload);
    }

    return buildCustomSchemeImportUrl(payload);
}
