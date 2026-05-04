import zlib from "node:zlib";

import { base64UrlToBytes } from "./base64url.js";

/** Matches browser `compress()` in frontend (deflate / zlib wrapper). */
export function decompressDeflateBase64Url(base64String: string): string {
    return zlib.inflateSync(base64UrlToBytes(base64String)).toString("utf8");
}
