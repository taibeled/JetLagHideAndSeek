import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

import {
    canonicalize,
    type WireV1Snapshot,
    wireV1SnapshotSchema,
} from "../src/wire.js";
import { computeSidFromCanonicalUtf8 } from "../src/sid.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type WireV1SnapshotWithProperties = WireV1Snapshot & {
    properties: Record<string, unknown>;
};

function readFixtureSnapshot(): WireV1SnapshotWithProperties {
    const raw = readFileSync(
        join(__dirname, "../../tests/fixtures/wire-v1.json"),
        "utf8",
    );
    const snap = wireV1SnapshotSchema.parse(JSON.parse(raw));
    if (
        !snap.properties ||
        typeof snap.properties !== "object" ||
        Array.isArray(snap.properties)
    ) {
        throw new Error("Fixture snapshot must have object properties");
    }
    return {
        ...snap,
        properties: snap.properties as Record<string, unknown>,
    };
}

function fixtureBlob(): { sid: string; compressed: string } {
    const snap = readFixtureSnapshot();
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

    it("POST appends two different SIDs then GET returns both in order", async () => {
        const blob1 = fixtureBlob();
        await app.inject({
            method: "PUT",
            url: `/api/cas/blobs/${blob1.sid}`,
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: blob1.compressed,
        });

        // Build a second blob with slightly different content.
        const parsed = readFixtureSnapshot();
        const modified = {
            ...parsed,
            properties: { ...parsed.properties, name: "Modified" },
        };
        const snap2 = wireV1SnapshotSchema.parse(modified);
        const canonical2 = canonicalize(snap2);
        const sid2 = computeSidFromCanonicalUtf8(canonical2);
        const compressed2 = zlib.deflateSync(Buffer.from(canonical2, "utf8"))
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        await app.inject({
            method: "PUT",
            url: `/api/cas/blobs/${sid2}`,
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: compressed2,
        });

        await app.inject({
            method: "POST",
            url: `/api/teams/${teamId}/snapshots`,
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ sid: blob1.sid }),
        });
        await app.inject({
            method: "POST",
            url: `/api/teams/${teamId}/snapshots`,
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ sid: sid2 }),
        });

        const list = await app.inject({
            method: "GET",
            url: `/api/teams/${teamId}/snapshots`,
        });
        expect(list.statusCode).toBe(200);
        const body = JSON.parse(list.body) as {
            snapshots: { sid: string }[];
        };
        expect(body.snapshots).toHaveLength(2);
        expect(body.snapshots[0]!.sid).toBe(blob1.sid);
        expect(body.snapshots[1]!.sid).toBe(sid2);
    });

    it("enforces maxTeamEntries limit", async () => {
        const limitDir = await mkdtemp(join(tmpdir(), "cas-team-limit-"));
        const limitApp = await buildApp({
            dataDir: limitDir,
            maxCanonicalBytes: 1024 * 1024,
            maxCompressedBodyBytes: 2 * 1024 * 1024,
            maxTeamEntries: 3,
            corsOrigin: true,
        });
        await limitApp.ready();

        // Create 4 different blobs to get past SID deduplication.
        const base = readFixtureSnapshot();
        const sids: string[] = [];
        for (let i = 0; i < 4; i++) {
            const modified = {
                ...base,
                properties: { ...base.properties, name: `LimitTest ${i}` },
            };
            const snap = wireV1SnapshotSchema.parse(modified);
            const canonical = canonicalize(snap);
            const sid = computeSidFromCanonicalUtf8(canonical);
            const compressed = zlib
                .deflateSync(Buffer.from(canonical, "utf8"))
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=/g, "");
            await limitApp.inject({
                method: "PUT",
                url: `/api/cas/blobs/${sid}`,
                headers: { "content-type": "text/plain; charset=utf-8" },
                payload: compressed,
            });
            sids.push(sid);
        }

        // First 3 POSTs should succeed.
        for (let i = 0; i < 3; i++) {
            const res = await limitApp.inject({
                method: "POST",
                url: `/api/teams/${teamId}/snapshots`,
                headers: { "content-type": "application/json" },
                payload: JSON.stringify({ sid: sids[i] }),
            });
            expect(res.statusCode).toBe(204);
        }

        // 4th POST should exceed limit.
        const over = await limitApp.inject({
            method: "POST",
            url: `/api/teams/${teamId}/snapshots`,
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ sid: sids[3] }),
        });
        expect(over.statusCode).toBe(500);

        await limitApp.close();
        await rm(limitDir, { recursive: true, force: true });
    });

    it("POST rejects invalid team id", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/teams/bad/snapshots",
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({
                sid: "AAAAAAAAAAAAAAAAAAAAAA",
            }),
        });
        expect(res.statusCode).toBe(400);
    });

    it("POST rejects invalid SID in body", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/api/teams/${teamId}/snapshots`,
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ sid: "invalid" }),
        });
        expect(res.statusCode).toBe(400);
    });
});
