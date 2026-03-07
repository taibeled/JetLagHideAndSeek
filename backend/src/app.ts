/**
 * Pure Hono application factory.
 *
 * Accepts a Drizzle `db` instance so that integration tests can inject an
 * in-memory SQLite database without touching the real DB file.
 *
 * Usage (production):
 *   import { db } from "./db/index.js";
 *   import { createApp } from "./app.js";
 *   const app = createApp(db);
 *
 * Usage (tests):
 *   const db = createTestDb();
 *   const app = createApp(db);
 *   const res = await app.request("/health");
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createQuestionsRouter } from "./routes/questions.js";
import { createSessionsRouter } from "./routes/sessions.js";
import type { Db } from "./db/types.js";

export function createApp(db: Db): Hono {
    const app = new Hono();

    // ── Middleware ────────────────────────────────────────────────────────────

    app.use("*", logger());
    app.use(
        "*",
        cors({
            origin: (origin) => {
                const allowed = [
                    process.env.FRONTEND_ORIGIN ?? "http://localhost:4321",
                    "http://localhost:4321",
                    "http://localhost:3000",
                ];
                if (allowed.includes(origin)) return origin;
                // Allow local network access (e.g. phone on same WiFi)
                if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|127\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
                    return origin;
                }
                return allowed[0];
            },
            allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allowHeaders: ["Content-Type", "x-participant-token"],
            credentials: true,
        }),
    );

    // ── REST Routes ───────────────────────────────────────────────────────────

    app.route("/api/sessions", createSessionsRouter(db));
    app.route("/api", createQuestionsRouter(db));

    // ── Health check ──────────────────────────────────────────────────────────

    app.get("/health", (c) => c.json({ ok: true }));

    return app;
}
