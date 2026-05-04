import crypto from "node:crypto";

import { bytesToBase64Url } from "./base64url.js";

export function computeSidFromCanonicalUtf8(canonicalUtf8: string): string {
    const hash = crypto
        .createHash("sha256")
        .update(canonicalUtf8, "utf8")
        .digest()
        .subarray(0, 16);
    return bytesToBase64Url(new Uint8Array(hash));
}

/** Expected length for v1 sid (16 raw bytes, base64url, no pad). */
export const SID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
