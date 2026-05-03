import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { canonicalize, wireV1SnapshotSchema } from "../src/wire.js";
import { computeSidFromCanonicalUtf8 } from "../src/sid.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function deflateBase64Url(str: string): string {
    return zlib.deflateSync(Buffer.from(str, "utf8"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

describe("CAS blobs API", () => {
    let dataDir: string;
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeEach(async () => {
        dataDir = await mkdtemp(join(tmpdir(), "cas-blob-"));
        app = await buildApp({
            dataDir,
            maxCanonicalBytes: 1024 * 1024,
            maxCompressedBodyBytes: 2 * 1024 * 1024,
            maxTeamEntries: 100,
            corsOrigin: true,
        });
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
        await rm(dataDir, { recursive: true, force: true });
    });

    it("PUT verifies sid then GET roundtrips compressed payload", async () => {
        const raw = readFileSync(
            join(__dirname, "../../tests/fixtures/wire-v1.json"),
            "utf8",
        );
        const snap = wireV1SnapshotSchema.parse(JSON.parse(raw));
        const canonicalUtf8 = canonicalize(snap);
        const sid = computeSidFromCanonicalUtf8(canonicalUtf8);
        const deflated = zlib.deflateSync(Buffer.from(canonicalUtf8, "utf8"));
        const compressed = deflated
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");

        const putRes = await app.inject({
            method: "PUT",
            url: `/api/cas/blobs/${sid}`,
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: compressed,
        });
        expect(putRes.statusCode).toBe(200);

        const getRes = await app.inject({
            method: "GET",
            url: `/api/cas/blobs/${sid}`,
        });
        expect(getRes.statusCode).toBe(200);
        expect(getRes.body).toBe(compressed);
    });

    it("PUT rejects sid mismatch", async () => {
        const raw = readFileSync(
            join(__dirname, "../../tests/fixtures/wire-v1.json"),
            "utf8",
        );
        const snap = wireV1SnapshotSchema.parse(JSON.parse(raw));
        const canonicalUtf8 = canonicalize(snap);
        const sid = computeSidFromCanonicalUtf8(canonicalUtf8);
        const deflated = zlib.deflateSync(Buffer.from(canonicalUtf8, "utf8"));
        const compressed = deflated
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");

        const putRes = await app.inject({
            method: "PUT",
            url: `/api/cas/blobs/AAAAAAAAAAAAAAAAAAAAAA`,
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: compressed,
        });
        expect(putRes.statusCode).toBe(400);
    });

    it("GET missing blob is 404", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/api/cas/blobs/9Tt79VmedVVPOG5Z83f36Q`,
        });
        expect(res.statusCode).toBe(404);
    });

    it("PUT rejects invalid SID path param", async () => {
        const res = await app.inject({
            method: "PUT",
            url: "/api/cas/blobs/invalid sid",
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: "AAAAAAAAAAAAAAAAAAAAAA",
        });
        expect(res.statusCode).toBe(400);
    });

    it("PUT rejects payload larger than maxCompressedBodyBytes", async () => {
        const smallDir = await mkdtemp(join(tmpdir(), "cas-blob-small-"));
        const smallApp = await buildApp({
            dataDir: smallDir,
            maxCanonicalBytes: 1024 * 1024,
            maxCompressedBodyBytes: 10,
            maxTeamEntries: 100,
            corsOrigin: true,
        });
        await smallApp.ready();
        const res = await smallApp.inject({
            method: "PUT",
            url: "/api/cas/blobs/AAAAAAAAAAAAAAAAAAAAAA",
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: "x".repeat(20),
        });
        expect(res.statusCode).toBe(413);
        await smallApp.close();
        await rm(smallDir, { recursive: true, force: true });
    });

    it("PUT rejects invalid compressed payload (not valid deflate)", async () => {
        const res = await app.inject({
            method: "PUT",
            url: "/api/cas/blobs/AAAAAAAAAAAAAAAAAAAAAA",
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: "not-deflated-data",
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe("Invalid compressed payload");
    });

    it("PUT rejects valid deflate that decodes to invalid JSON", async () => {
        const body = deflateBase64Url("not json");
        const res = await app.inject({
            method: "PUT",
            url: "/api/cas/blobs/AAAAAAAAAAAAAAAAAAAAAA",
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: body,
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe(
            "Invalid JSON after decompress",
        );
    });

    it("PUT rejects schema-invalid wire JSON (missing required v field)", async () => {
        const body = deflateBase64Url(JSON.stringify({ some: "data" }));
        const res = await app.inject({
            method: "PUT",
            url: "/api/cas/blobs/AAAAAAAAAAAAAAAAAAAAAA",
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: body,
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe("Invalid wire snapshot");
    });

    it("PUT accepts the same canonical payload at the same SID twice", async () => {
        const raw = readFileSync(
            join(__dirname, "../../tests/fixtures/wire-v1.json"),
            "utf8",
        );
        const snap = wireV1SnapshotSchema.parse(JSON.parse(raw));
        const canonicalUtf8 = canonicalize(snap);
        const sid = computeSidFromCanonicalUtf8(canonicalUtf8);
        const compressed = deflateBase64Url(canonicalUtf8);

        const putRes1 = await app.inject({
            method: "PUT",
            url: `/api/cas/blobs/${sid}`,
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: compressed,
        });
        expect(putRes1.statusCode).toBe(200);

        const putRes2 = await app.inject({
            method: "PUT",
            url: `/api/cas/blobs/${sid}`,
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: compressed,
        });
        expect(putRes2.statusCode).toBe(200);

        const getRes = await app.inject({
            method: "GET",
            url: `/api/cas/blobs/${sid}`,
        });
        expect(getRes.statusCode).toBe(200);
        expect(getRes.body).toBe(compressed);
    });

    it("PUT rejects different content at the same SID (sid mismatch)", async () => {
        const raw = readFileSync(
            join(__dirname, "../../tests/fixtures/wire-v1.json"),
            "utf8",
        );
        const snap = wireV1SnapshotSchema.parse(JSON.parse(raw));
        const canonicalUtf8 = canonicalize(snap);
        const sid = computeSidFromCanonicalUtf8(canonicalUtf8);
        const compressed = deflateBase64Url(canonicalUtf8);

        // First PUT the correct blob
        const putOk = await app.inject({
            method: "PUT",
            url: `/api/cas/blobs/${sid}`,
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: compressed,
        });
        expect(putOk.statusCode).toBe(200);

        // Now PUT a different body at the same SID path
        const differentBody = deflateBase64Url(
            canonicalize({ v: 1, type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }),
        );
        const res = await app.inject({
            method: "PUT",
            url: `/api/cas/blobs/${sid}`,
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: differentBody,
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe("sid mismatch");
    });

    it("GET returns 404 for non-existent SID", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/api/cas/blobs/AAAAAAAAAAAAAAAAAAAAAA`,
        });
        expect(res.statusCode).toBe(404);
    });
});
