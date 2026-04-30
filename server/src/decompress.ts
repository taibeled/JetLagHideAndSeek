import zlib from "node:zlib";

/** Matches browser `compress()` in frontend (deflate / zlib wrapper). */
export function decompressDeflateBase64Url(base64String: string): string {
    const regularBase64 = base64String.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
        regularBase64 + "=".repeat((4 - (regularBase64.length % 4)) % 4);
    const buf = Buffer.from(padded, "base64");
    return zlib.inflateSync(buf).toString("utf8");
}
