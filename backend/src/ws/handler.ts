import type { ClientToServerEvent } from "@hideandseek/shared";
import { QUESTION_DEADLINE_MS } from "@hideandseek/shared";
import { and, eq } from "drizzle-orm";
import type { WSContext } from "hono/ws";
import { nanoid } from "nanoid";

import { db, schema } from "../db/index.js";
import { toSessionQuestion } from "../routes/sessions.js";
import { type ConnectedClient, wsManager } from "./manager.js";

// ── In-memory expiry timer registry ──────────────────────────────────────────
// Maps questionId → NodeJS timer handle.  Cleared when a question is answered.
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a server-side expiry broadcast for a question.
 * When the deadline passes the question is marked 'expired' in the DB and
 * a `question_expired` event is broadcast to all session participants.
 */
function scheduleExpiry(
    questionId: string,
    sessionCode: string,
    sessionId: string,
    deadlineMs: number,
): void {
    const delay = Math.max(0, deadlineMs - Date.now());
    const timer = setTimeout(async () => {
        expiryTimers.delete(questionId);

        // Mark as expired in DB only if the question is still pending.
        // The conditional WHERE prevents overwriting an answer that arrived
        // in the narrow window between the timer firing and this DB write.
        await db
            .update(schema.questions)
            .set({ status: "expired" })
            .where(
                and(
                    eq(schema.questions.id, questionId),
                    eq(schema.questions.status, "pending"),
                ),
            );

        // Re-read to make sure it was actually pending (not answered in the meantime)
        const row = await db.query.questions.findFirst({
            where: eq(schema.questions.id, questionId),
        });
        if (!row || row.status !== "expired") return; // was answered before timer fired

        const event = {
            type: "question_expired" as const,
            questionId,
        };
        wsManager.broadcast(sessionCode, event);
        void wsManager.persistEvent(db, sessionId, null, event);
    }, delay);

    expiryTimers.set(questionId, timer);
}

function cancelExpiry(questionId: string): void {
    const timer = expiryTimers.get(questionId);
    if (timer !== undefined) {
        clearTimeout(timer);
        expiryTimers.delete(questionId);
    }
}

/**
 * Called when a new WebSocket connection is established.
 *
 * Expected URL: /ws/:code?token=<participantToken>
 */
export async function handleWsOpen(
    ws: WSContext,
    sessionCode: string,
    token: string | null,
): Promise<ConnectedClient | null> {
    const code = sessionCode.toUpperCase();

    const sessionRow = await db.query.sessions.findFirst({
        where: eq(schema.sessions.code, code),
    });

    if (!sessionRow || sessionRow.status === "finished") {
        ws.close(4404, "Session not found or finished");
        return null;
    }

    if (!token) {
        ws.close(4401, "Missing token");
        return null;
    }

    const participant = await db.query.participants.findFirst({
        where: (p, { and, eq: eq_ }) =>
            and(eq_(p.token, token), eq_(p.sessionId, sessionRow.id)),
    });

    if (!participant) {
        ws.close(4403, "Invalid token");
        return null;
    }

    const client: ConnectedClient = {
        ws,
        sessionCode: code,
        sessionId: sessionRow.id,
        participantId: participant.id,
        role: participant.role as "hider" | "seeker",
    };

    wsManager.register(client);

    // Notify others that someone joined
    const joinedEvent = {
        type: "participant_joined" as const,
        participantId: participant.id,
        role: participant.role as "hider" | "seeker",
        displayName: participant.displayName,
    };
    wsManager.broadcast(code, joinedEvent, client);
    void wsManager.persistEvent(db, sessionRow.id, participant.id, joinedEvent);

    // Send current state to the newly connected client
    const questionRows = await db.query.questions.findMany({
        where: eq(schema.questions.sessionId, sessionRow.id),
        orderBy: (q, { asc }) => [asc(q.createdAt)],
    });

    ws.send(
        JSON.stringify({
            type: "sync",
            questions: questionRows.map(toSessionQuestion),
            mapLocation: sessionRow.mapLocation
                ? JSON.parse(sessionRow.mapLocation)
                : null,
            status: sessionRow.status,
            seekerCount: wsManager.seekerCount(code),
            hiderConnected: wsManager.hiderConnected(code),
        }),
    );

    return client;
}

/**
 * Called for each incoming WebSocket message from a client.
 */
export async function handleWsMessage(
    client: ConnectedClient,
    rawData: string | ArrayBuffer,
): Promise<void> {
    let event: ClientToServerEvent;
    try {
        event = JSON.parse(
            typeof rawData === "string" ? rawData : new TextDecoder().decode(rawData),
        ) as ClientToServerEvent;
    } catch {
        return; // Ignore malformed messages
    }

    const code = client.sessionCode;

    switch (event.type) {
        case "ping":
            client.ws.send(JSON.stringify({ type: "pong" }));
            break;

        case "add_question": {
            if (client.role !== "seeker") return;

            const sessionRow = await db.query.sessions.findFirst({
                where: eq(schema.sessions.code, code),
            });
            if (!sessionRow || sessionRow.status === "finished") return;

            const questionId = nanoid();
            const deadline = new Date(Date.now() + QUESTION_DEADLINE_MS).toISOString();

            await db.insert(schema.questions).values({
                id: questionId,
                sessionId: sessionRow.id,
                createdByParticipantId: client.participantId,
                type: event.questionType,
                data: JSON.stringify(event.data),
                status: "pending",
                deadline,
            });

            const questionRow = (await db.query.questions.findFirst({
                where: eq(schema.questions.id, questionId),
            }))!;

            const questionAddedEvent = {
                type: "question_added" as const,
                question: toSessionQuestion(questionRow),
            };
            wsManager.broadcast(code, questionAddedEvent);
            void wsManager.persistEvent(db, client.sessionId, client.participantId, questionAddedEvent);

            scheduleExpiry(questionId, code, client.sessionId, new Date(deadline).getTime());
            break;
        }

        case "answer_question": {
            if (client.role !== "hider") return;

            const questionRow = await db.query.questions.findFirst({
                where: eq(schema.questions.id, event.questionId),
            });
            // Allow answering both "pending" and "expired" questions (late answers are allowed).
            if (!questionRow || (questionRow.status !== "pending" && questionRow.status !== "expired")) return;
            if (questionRow.sessionId !== (await getSessionId(code))) return;

            const answeredAt = new Date().toISOString();
            await db
                .update(schema.questions)
                .set({
                    status: "answered",
                    answerData: JSON.stringify(event.answerData),
                    answeredAt,
                })
                .where(eq(schema.questions.id, event.questionId));

            const updatedRow = (await db.query.questions.findFirst({
                where: eq(schema.questions.id, event.questionId),
            }))!;

            // Cancel the expiry timer now that the question is answered
            cancelExpiry(event.questionId);

            const questionAnsweredEvent = {
                type: "question_answered" as const,
                question: toSessionQuestion(updatedRow),
            };
            wsManager.broadcast(code, questionAnsweredEvent);
            void wsManager.persistEvent(db, client.sessionId, client.participantId, questionAnsweredEvent);
            break;
        }

        case "update_map_location": {
            const sessionRow = await db.query.sessions.findFirst({
                where: eq(schema.sessions.code, code),
            });
            if (!sessionRow) return;

            await db
                .update(schema.sessions)
                .set({ mapLocation: JSON.stringify(event.mapLocation) })
                .where(eq(schema.sessions.id, sessionRow.id));

            const mapEvent = {
                type: "map_location_updated" as const,
                mapLocation: event.mapLocation,
            };
            wsManager.broadcast(code, mapEvent, client);
            void wsManager.persistEvent(db, client.sessionId, client.participantId, mapEvent);
            break;
        }

        case "set_status": {
            if (client.role !== "seeker") return;

            const sessionRow = await db.query.sessions.findFirst({
                where: eq(schema.sessions.code, code),
            });
            if (!sessionRow) return;
            if (sessionRow.status === "finished") return;

            await db
                .update(schema.sessions)
                .set({ status: event.status })
                .where(eq(schema.sessions.id, sessionRow.id));

            const statusEvent = {
                type: "session_status_changed" as const,
                status: event.status,
            };
            wsManager.broadcast(code, statusEvent);
            void wsManager.persistEvent(db, client.sessionId, client.participantId, statusEvent);
            break;
        }
    }
}

/** Called when a WebSocket connection closes */
export function handleWsClose(client: ConnectedClient): void {
    wsManager.unregister(client);
    const leftEvent = {
        type: "participant_left" as const,
        participantId: client.participantId,
    };
    wsManager.broadcast(client.sessionCode, leftEvent);
    void wsManager.persistEvent(db, client.sessionId, client.participantId, leftEvent);
}

async function getSessionId(code: string): Promise<string | null> {
    const row = await db.query.sessions.findFirst({
        where: eq(schema.sessions.code, code),
    });
    return row?.id ?? null;
}
