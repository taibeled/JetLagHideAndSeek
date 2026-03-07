import type {
    CreateSessionRequest,
    CreateSessionResponse,
    GetSessionResponse,
    JoinSessionRequest,
    JoinSessionResponse,
    UpdateMapLocationRequest,
} from "@hideandseek/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";

import { schema } from "../db/schema.js";
import type { Session, DbQuestion } from "../db/schema.js";
import type { Db } from "../db/types.js";
import { wsManager } from "../ws/manager.js";

/** Generate a human-readable 6-character session code (uppercase letters + digits) */
function generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous I/O/0/1
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

/** Convert a DB session row to the shared Session type */
function toSession(row: Session) {
    return {
        id: row.id,
        code: row.code,
        status: row.status as "waiting" | "active" | "finished",
        mapLocation: row.mapLocation ? JSON.parse(row.mapLocation) : null,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
    };
}

/**
 * Build a Map<participantId, displayName> for all participants in a session.
 * Used to denormalise display names onto SessionQuestion objects.
 */
export async function buildParticipantsMap(
    db: Db,
    sessionId: string,
): Promise<Map<string, string>> {
    const rows = await db.query.participants.findMany({
        where: eq(schema.participants.sessionId, sessionId),
    });
    return new Map(rows.map((r) => [r.id, r.displayName]));
}

export function toSessionQuestion(
    row: DbQuestion,
    participantsMap?: Map<string, string>,
) {
    return {
        id: row.id,
        sessionId: row.sessionId,
        createdByParticipantId: row.createdByParticipantId,
        type: row.type,
        data: JSON.parse(row.data),
        status: row.status as "pending" | "answered" | "expired",
        answerData: row.answerData ? JSON.parse(row.answerData) : undefined,
        createdAt: row.createdAt,
        answeredAt: row.answeredAt ?? undefined,
        deadline: row.deadline ?? undefined,
        answeredByParticipantId: row.answeredByParticipantId ?? undefined,
        createdByDisplayName: participantsMap?.get(row.createdByParticipantId),
        answeredByDisplayName: row.answeredByParticipantId
            ? participantsMap?.get(row.answeredByParticipantId)
            : undefined,
    };
}

/** Create the sessions router, injecting the database instance. */
export function createSessionsRouter(db: Db): Hono {
    const router = new Hono();

    // ── POST /sessions ────────────────────────────────────────────────────────

    router.post("/", async (c) => {
        const body: CreateSessionRequest = await c.req.json();

        if (!body.displayName?.trim()) {
            return c.json({ error: "displayName is required" }, 400);
        }

        // Generate a unique code
        let code: string;
        let attempts = 0;
        do {
            code = generateCode();
            const existing = await db.query.sessions.findFirst({
                where: eq(schema.sessions.code, code),
            });
            if (!existing) break;
            attempts++;
        } while (attempts < 10);

        const sessionId = nanoid();
        const participantId = nanoid();
        const token = nanoid(32);

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await db.insert(schema.sessions).values({
            id: sessionId,
            code: code!,
            status: "waiting",
            mapLocation: body.mapLocation
                ? JSON.stringify(body.mapLocation)
                : null,
            expiresAt,
        });

        await db.insert(schema.participants).values({
            id: participantId,
            sessionId,
            role: "hider",
            token,
            displayName: body.displayName.trim(),
        });

        const sessionRow = (await db.query.sessions.findFirst({
            where: eq(schema.sessions.id, sessionId),
        }))!;

        const response: CreateSessionResponse = {
            session: toSession(sessionRow),
            participant: {
                id: participantId,
                sessionId,
                role: "hider",
                displayName: body.displayName.trim(),
                joinedAt: new Date().toISOString(),
                token,
            },
        };

        return c.json(response, 201);
    });

    // ── GET /sessions/:code ───────────────────────────────────────────────────

    router.get("/:code", async (c) => {
        const code = c.req.param("code").toUpperCase();

        const sessionRow = await db.query.sessions.findFirst({
            where: eq(schema.sessions.code, code),
        });

        if (!sessionRow) {
            return c.json({ error: "Session not found" }, 404);
        }

        const questionRows = await db.query.questions.findMany({
            where: eq(schema.questions.sessionId, sessionRow.id),
            orderBy: (q, { asc }) => [asc(q.createdAt)],
        });

        const pMap = await buildParticipantsMap(db, sessionRow.id);

        const response: GetSessionResponse = {
            session: toSession(sessionRow),
            questions: questionRows.map((r) => toSessionQuestion(r, pMap)),
            seekerCount: wsManager.seekerCount(code),
            hiderConnected: wsManager.hiderConnected(code),
        };

        return c.json(response);
    });

    // ── POST /sessions/:code/join ─────────────────────────────────────────────

    router.post("/:code/join", async (c) => {
        const code = c.req.param("code").toUpperCase();
        const body: JoinSessionRequest = await c.req.json();

        if (!body.displayName?.trim()) {
            return c.json({ error: "displayName is required" }, 400);
        }

        const role = body.role ?? "seeker";
        if (role !== "hider" && role !== "seeker") {
            return c.json({ error: "invalid role" }, 400);
        }

        const sessionRow = await db.query.sessions.findFirst({
            where: eq(schema.sessions.code, code),
        });

        if (!sessionRow) {
            return c.json({ error: "Session not found" }, 404);
        }
        if (sessionRow.status === "finished") {
            return c.json({ error: "Session has already finished" }, 410);
        }

        const participantId = nanoid();
        const token = nanoid(32);

        await db.insert(schema.participants).values({
            id: participantId,
            sessionId: sessionRow.id,
            role,
            token,
            displayName: body.displayName.trim(),
        });

        // Notify existing clients
        wsManager.broadcast(code, {
            type: "participant_joined",
            participantId,
            role,
            displayName: body.displayName.trim(),
        });

        const response: JoinSessionResponse = {
            session: toSession(sessionRow),
            participant: {
                id: participantId,
                sessionId: sessionRow.id,
                role,
                displayName: body.displayName.trim(),
                joinedAt: new Date().toISOString(),
                token,
            },
        };

        return c.json(response, 201);
    });

    // ── PATCH /sessions/:code/map ─────────────────────────────────────────────

    router.patch("/:code/map", async (c) => {
        const code = c.req.param("code").toUpperCase();
        const token = c.req.header("x-participant-token");
        const body: UpdateMapLocationRequest = await c.req.json();

        if (!token) return c.json({ error: "Missing token" }, 401);
        if (!body.mapLocation) return c.json({ error: "mapLocation is required" }, 400);

        const sessionRow = await db.query.sessions.findFirst({
            where: eq(schema.sessions.code, code),
        });
        if (!sessionRow) return c.json({ error: "Session not found" }, 404);

        // Verify token belongs to this session
        const participant = await db.query.participants.findFirst({
            where: (p, { and, eq: eq_ }) =>
                and(eq_(p.token, token), eq_(p.sessionId, sessionRow.id)),
        });
        if (!participant) return c.json({ error: "Invalid token" }, 403);

        await db
            .update(schema.sessions)
            .set({ mapLocation: JSON.stringify(body.mapLocation) })
            .where(eq(schema.sessions.id, sessionRow.id));

        wsManager.broadcast(code, {
            type: "map_location_updated",
            mapLocation: body.mapLocation,
        });

        return c.json({ ok: true });
    });

    return router;
}


