import zlib from "node:zlib";
import { describe, expect, test } from "vitest";

import { decompressDeflateBase64Url } from "../src/decompress.js";

function deflateBase64Url(str: string): string {
    return zlib
        .deflateSync(Buffer.from(str, "utf8"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

describe("decompressDeflateBase64Url", () => {
    test("roundtrips a simple string", () => {
        const input = "hello world";
        const encoded = deflateBase64Url(input);
        const result = decompressDeflateBase64Url(encoded);
        expect(result).toBe(input);
    });

    test("roundtrips an empty string", () => {
        const encoded = deflateBase64Url("");
        const result = decompressDeflateBase64Url(encoded);
        expect(result).toBe("");
    });

    test("throws on invalid base64url input", () => {
        expect(() => decompressDeflateBase64Url("!!!not-valid!!!")).toThrow();
    });

    test("roundtrips a longer JSON string", () => {
        const input = '{"key":"value","nested":{"a":1}}';
        const encoded = deflateBase64Url(input);
        const result = decompressDeflateBase64Url(encoded);
        expect(result).toBe(input);
    });
});
