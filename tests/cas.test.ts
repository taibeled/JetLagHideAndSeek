import { describe, expect, it, vi } from "vitest";

import { computeSidFromCanonicalUtf8, putBlob } from "@/lib/cas";

describe("cas client helpers", () => {
    it("computeSid is stable for identical canonical UTF-8", async () => {
        const sid1 = await computeSidFromCanonicalUtf8('{"a":1}');
        const sid2 = await computeSidFromCanonicalUtf8('{"a":1}');
        expect(sid1).toBe(sid2);
        expect(sid1).toHaveLength(22);
    });

    it("putBlob uses deflate payload + PUT sid route", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => "",
        });
        vi.stubGlobal("fetch", fetchMock);

        await putBlob(
            "https://example.com",
            "payloadB64",
            "9Tt79VmedVVPOG5Z83f36Q",
        );

        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.com/api/cas/blobs/9Tt79VmedVVPOG5Z83f36Q",
            expect.objectContaining({
                method: "PUT",
                headers: { "Content-Type": "text/plain; charset=utf-8" },
                body: "payloadB64",
            }),
        );

        vi.unstubAllGlobals();
    });
});
