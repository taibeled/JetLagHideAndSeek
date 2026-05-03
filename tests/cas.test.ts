import { afterEach, describe, expect, it, vi } from "vitest";

import {
    appendTeamSnapshot,
    computeSidFromCanonicalUtf8,
    getBlob,
    listTeamSnapshots,
    newTeamId,
    normalizeCasBaseUrl,
    probeHealth,
    putBlob,
    TEAM_ID_REGEX,
} from "@/lib/cas";

describe("cas client helpers", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

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
    });

    it("putBlob throws on non-OK response", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => "server error",
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            putBlob("https://example.com", "payloadB64", "sid1"),
        ).rejects.toThrow("server error");
    });

    it("getBlob(baseUrl, sid) fetches correct URL, returns compressed text body", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => "compressed-blob-body",
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await getBlob("https://example.com", "sid1");

        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.com/api/cas/blobs/sid1",
            { method: "GET" },
        );
        expect(result).toBe("compressed-blob-body");
    });

    it("getBlob throws on non-OK response", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(getBlob("https://example.com", "sid1")).rejects.toThrow(
            "GET blob failed: 404",
        );
    });

    it("probeHealth(url) returns true on 200 response", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal("fetch", fetchMock);

        const result = await probeHealth("https://example.com");

        expect(result).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.com/api/cas/health",
            expect.objectContaining({
                method: "GET",
                signal: expect.any(AbortSignal),
            }),
        );
    });

    it("probeHealth(url) returns false on fetch failure", async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValue(new DOMException("aborted", "AbortError"));
        vi.stubGlobal("fetch", fetchMock);

        const result = await probeHealth("https://example.com");

        expect(result).toBe(false);
    });

    it("newTeamId() returns a 22-character base64url string matching TEAM_ID_REGEX", () => {
        vi.stubGlobal("crypto", {
            getRandomValues: (arr: Uint8Array) => {
                arr.fill(0xaa);
                return arr;
            },
            subtle: { digest: vi.fn() },
        });

        const id = newTeamId();

        expect(id).toHaveLength(22);
        expect(TEAM_ID_REGEX.test(id)).toBe(true);
    });

    it("normalizeCasBaseUrl(raw) strips trailing slashes", () => {
        expect(normalizeCasBaseUrl("https://example.com")).toBe(
            "https://example.com",
        );
        expect(normalizeCasBaseUrl("https://example.com/")).toBe(
            "https://example.com",
        );
        expect(normalizeCasBaseUrl("https://example.com///")).toBe(
            "https://example.com",
        );
        expect(normalizeCasBaseUrl("https://example.com/path/")).toBe(
            "https://example.com/path",
        );
    });

    it("appendTeamSnapshot(baseUrl, teamId, sid) POSTs to correct URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => "",
        });
        vi.stubGlobal("fetch", fetchMock);

        await appendTeamSnapshot(
            "https://example.com",
            "abcdefghijklmnop1234",
            "sid1",
        );

        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.com/api/teams/abcdefghijklmnop1234/snapshots",
            expect.objectContaining({
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sid: "sid1" }),
            }),
        );
    });

    it("appendTeamSnapshot rejects invalid team ID", async () => {
        await expect(
            appendTeamSnapshot("https://example.com", "bad", "sid1"),
        ).rejects.toThrow("Invalid team id");

        await expect(
            appendTeamSnapshot("https://example.com", "a".repeat(15), "sid1"),
        ).rejects.toThrow("Invalid team id");

        await expect(
            appendTeamSnapshot("https://example.com", "a".repeat(33), "sid1"),
        ).rejects.toThrow("Invalid team id");
    });

    it("listTeamSnapshots(baseUrl, teamId) returns snapshot array", async () => {
        const snapshots = [{ sid: "abc", ts: 123 }];
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ snapshots }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await listTeamSnapshots(
            "https://example.com",
            "abcdefghijklmnop1234",
        );

        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.com/api/teams/abcdefghijklmnop1234/snapshots",
            { method: "GET" },
        );
        expect(result).toEqual(snapshots);
    });

    it("listTeamSnapshots rejects invalid team ID", async () => {
        await expect(
            listTeamSnapshots("https://example.com", "bad"),
        ).rejects.toThrow("Invalid team id");
    });
});
