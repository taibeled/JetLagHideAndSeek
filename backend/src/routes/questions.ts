import type {
    AddQuestionRequest,
    AddQuestionResponse,
    AnswerQuestionRequest,
    AnswerQuestionResponse,
} from "@hideandseek/shared";
import { QUESTION_DEADLINE_MS } from "@hideandseek/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";

import { schema } from "../db/schema.js";
import type { Db } from "../db/types.js";
import { wsManager } from "../ws/manager.js";
import { buildParticipantsMap, toSessionQuestion } from "./sessions.js";

/** Create the questions router, injecting the database instance. */
export function createQuestionsRouter(db: Db): Hono {
    const router = new Hono();

    // ── POST /sessions/:code/questions ────────────────────────────────────────

    router.post("/sessions/:code/questions", async (c) => {
        const code = c.req.param("code").toUpperCase();
        const token = c.req.header("x-participant-token");
        const body: AddQuestionRequest = await c.req.json();

        const sessionRow = await db.query.sessions.findFirst({
            where: eq(schema.sessions.code, code),
        });
        if (!sessionRow) return c.json({ error: "Session not found" }, 404);
        if (sessionRow.status === "finished")
            return c.json({ error: "Session has finished" }, 410);

        const participant = await resolveParticipant(db, sessionRow.id, token);
        if (!participant) return c.json({ error: "Invalid token" }, 403);

        // Only seekers may add questions to the session
        if (participant.role !== "seeker") {
            return c.json({ error: "Only seekers can add questions" }, 403);
        }

        if (!body.type || !body.data) {
            return c.json({ error: "type and data are required" }, 400);
        }

        const questionId = nanoid();
        const deadline = new Date(Date.now() + QUESTION_DEADLINE_MS).toISOString();

        await db.insert(schema.questions).values({
            id: questionId,
            sessionId: sessionRow.id,
            createdByParticipantId: participant.id,
            type: body.type,
            data: JSON.stringify(body.data),
            status: "pending",
            deadline,
        });

        const questionRow = (await db.query.questions.findFirst({
            where: eq(schema.questions.id, questionId),
        }))!;

        const pMap = await buildParticipantsMap(db, sessionRow.id);
        const question = toSessionQuestion(questionRow, pMap);

        // Broadcast to everyone (including the hider who needs to answer)
        wsManager.broadcast(code, {
            type: "question_added",
            question,
        });

        const response: AddQuestionResponse = { question };
        return c.json(response, 201);
    });

    // ── POST /questions/:id/answer ────────────────────────────────────────────

    router.post("/questions/:id/answer", async (c) => {
        const questionId = c.req.param("id");
        const token = c.req.header("x-participant-token");
        const body: AnswerQuestionRequest = await c.req.json();

        const questionRow = await db.query.questions.findFirst({
            where: eq(schema.questions.id, questionId),
        });
        if (!questionRow) return c.json({ error: "Question not found" }, 404);
        if (questionRow.status === "answered") {
            return c.json({ error: "Question already answered" }, 409);
        }
        // Expired questions can still be answered late — no 410 guard here.

        const participant = await resolveParticipant(db, questionRow.sessionId, token);
        if (!participant) return c.json({ error: "Invalid token" }, 403);

        // Only the hider answers questions
        if (participant.role !== "hider") {
            return c.json({ error: "Only the hider can answer questions" }, 403);
        }

        if (!body.answerData) {
            return c.json({ error: "answerData is required" }, 400);
        }

        const answeredAt = new Date().toISOString();

        await db
            .update(schema.questions)
            .set({
                status: "answered",
                answerData: JSON.stringify(body.answerData),
                answeredAt,
                answeredByParticipantId: participant.id,
            })
            .where(eq(schema.questions.id, questionId));

        const updatedRow = (await db.query.questions.findFirst({
            where: eq(schema.questions.id, questionId),
        }))!;

        const pMap = await buildParticipantsMap(db, questionRow.sessionId);
        const question = toSessionQuestion(updatedRow, pMap);

        // Fetch the session code for broadcasting
        const sessionRow = await db.query.sessions.findFirst({
            where: eq(schema.sessions.id, questionRow.sessionId),
        });

        if (sessionRow) {
            wsManager.broadcast(sessionRow.code, {
                type: "question_answered",
                question,
            });
        }

        const response: AnswerQuestionResponse = { question };
        return c.json(response);
    });

    // ── GET /sessions/:code/questions ─────────────────────────────────────────

    router.get("/sessions/:code/questions", async (c) => {
        const code = c.req.param("code").toUpperCase();
        const token = c.req.header("x-participant-token");

        const sessionRow = await db.query.sessions.findFirst({
            where: eq(schema.sessions.code, code),
        });
        if (!sessionRow) return c.json({ error: "Session not found" }, 404);

        const participant = await resolveParticipant(db, sessionRow.id, token);
        if (!participant) return c.json({ error: "Invalid token" }, 403);

        const questionRows = await db.query.questions.findMany({
            where: eq(schema.questions.sessionId, sessionRow.id),
            orderBy: (q, { asc }) => [asc(q.createdAt)],
        });

        const pMap = await buildParticipantsMap(db, sessionRow.id);
        return c.json({ questions: questionRows.map((r) => toSessionQuestion(r, pMap)) });
    });

    return router;
}

/** Middleware: resolve and validate participant token */
async function resolveParticipant(
    db: Db,
    sessionId: string,
    token: string | undefined,
) {
    if (!token) return null;
    return db.query.participants.findFirst({
        where: (p, { and, eq: eq_ }) =>
            and(eq_(p.token, token), eq_(p.sessionId, sessionId)),
    });
}

