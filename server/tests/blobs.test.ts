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
});
