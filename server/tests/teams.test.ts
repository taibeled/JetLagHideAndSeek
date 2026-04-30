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

function fixtureBlob(): { sid: string; compressed: string } {
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
    return { sid, compressed };
}

describe("team snapshots API", () => {
    let dataDir: string;
    let app: Awaited<ReturnType<typeof buildApp>>;
    const teamId = "abcdabcdabcdabcdabcdabcdabcdabcd";

    beforeEach(async () => {
        dataDir = await mkdtemp(join(tmpdir(), "cas-team-"));
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

    it("POST requires existing blob", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/api/teams/${teamId}/snapshots`,
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ sid: "9Tt79VmedVVPOG5Z83f36Q" }),
        });
        expect(res.statusCode).toBe(404);
    });

    it("POST append then GET lists snapshots", async () => {
        const { sid, compressed } = fixtureBlob();
        await app.inject({
            method: "PUT",
            url: `/api/cas/blobs/${sid}`,
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: compressed,
        });

        const post = await app.inject({
            method: "POST",
            url: `/api/teams/${teamId}/snapshots`,
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ sid }),
        });
        expect(post.statusCode).toBe(204);

        const dup = await app.inject({
            method: "POST",
            url: `/api/teams/${teamId}/snapshots`,
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ sid }),
        });
        expect(dup.statusCode).toBe(204);

        const list = await app.inject({
            method: "GET",
            url: `/api/teams/${teamId}/snapshots`,
        });
        expect(list.statusCode).toBe(200);
        const body = JSON.parse(list.body) as {
            snapshots: { sid: string }[];
        };
        expect(body.snapshots).toHaveLength(1);
        expect(body.snapshots[0]!.sid).toBe(sid);
    });

    it("rejects invalid team id", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/api/teams/not!/snapshots`,
        });
        expect(res.statusCode).toBe(400);
    });
});
