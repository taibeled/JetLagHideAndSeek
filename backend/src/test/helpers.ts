/**
 * Test helpers for backend integration tests.
 *
 * Two test modes are supported:
 *
 * 1. IN-PROCESS (default for CI): createTestApp() creates a Hono app backed by
 *    an in-memory SQLite database.  No external server needed.
 *    Requires better-sqlite3 native bindings to be compiled for the current
 *    Node version (run `npm rebuild better-sqlite3` if needed).
 *
 * 2. LIVE-SERVER (when BACKEND_URL is set): req() calls the running backend
 *    over HTTP.  Useful for smoke-testing a real deployment.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Hono } from "hono";

import { createApp } from "../app.js";
import * as schema from "../db/schema.js";

const MIGRATE_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL DEFAULT 'waiting'
                    CHECK(status IN ('waiting','active','finished')),
    map_location TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role         TEXT NOT NULL CHECK(role IN ('hider','seeker')),
    token        TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    joined_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
    id                           TEXT PRIMARY KEY,
    session_id                   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_by_participant_id    TEXT NOT NULL REFERENCES participants(id),
    type                         TEXT NOT NULL,
    data                         TEXT NOT NULL,
    status                       TEXT NOT NULL DEFAULT 'pending'
                                     CHECK(status IN ('pending','answered','expired')),
    answer_data                  TEXT,
    answered_by_participant_id   TEXT,
    created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
    answered_at                  TEXT,
    deadline                     TEXT
);

CREATE TABLE IF NOT EXISTS ws_events (
    id             TEXT PRIMARY KEY,
    session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id TEXT,
    event_type     TEXT NOT NULL,
    payload        TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);
CREATE INDEX IF NOT EXISTS idx_participants_token   ON participants(token);
CREATE INDEX IF NOT EXISTS idx_questions_session    ON questions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_code        ON sessions(code);
CREATE INDEX IF NOT EXISTS idx_ws_events_session    ON ws_events(session_id);
CREATE INDEX IF NOT EXISTS idx_ws_events_type       ON ws_events(session_id, event_type);
`;

/** Create a fresh in-memory SQLite database with all tables. */
export function createTestDb() {
    const sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(MIGRATE_SQL);
    return drizzle(sqlite, { schema });
}

/** Create a Hono app backed by the given test database. */
export function createTestApp(db: ReturnType<typeof createTestDb>): Hono {
    return createApp(db);
}

// ── HTTP request helper ───────────────────────────────────────────────────────

/** Base URL for live-server tests.  Unset = use in-process Hono app. */
const LIVE_URL = process.env.BACKEND_URL ?? null;

/**
 * Send a request either to the in-process Hono app (default) or to a live
 * server (when BACKEND_URL env var is set).
 */
export async function req<T = unknown>(
    app: Hono | null,
    method: string,
    path: string,
    options: {
        body?: unknown;
        token?: string;
        expectStatus?: number;
    } = {},
): Promise<{ status: number; body: T }> {
    const { body, token, expectStatus } = options;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Origin: "http://localhost:4321",
    };
    if (token) headers["x-participant-token"] = token;

    let res: Response;

    if (LIVE_URL) {
        // Live server mode: use global fetch
        res = await fetch(`${LIVE_URL}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } else {
        // In-process mode: use Hono's built-in test client
        if (!app) throw new Error("app is required when BACKEND_URL is not set");
        res = await app.request(path, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    }

    const json = (await res.json()) as T;

    if (expectStatus !== undefined && res.status !== expectStatus) {
        throw new Error(
            `Expected status ${expectStatus}, got ${res.status}. Body: ${JSON.stringify(json)}`,
        );
    }

    return { status: res.status, body: json };
}
