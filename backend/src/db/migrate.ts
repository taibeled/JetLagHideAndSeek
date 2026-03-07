/**
 * Creates all tables if they don't exist yet, and applies incremental migrations
 * for existing databases.  Safe to run multiple times (idempotent).
 * Run on first deploy and after every schema change: pnpm db:migrate
 */
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH ?? "./hideandseek.db";
const sqlite = new Database(DB_PATH);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// ── Initial schema (new databases) ───────────────────────────────────────────

sqlite.exec(`
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
    id                       TEXT PRIMARY KEY,
    session_id               TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_by_participant_id TEXT NOT NULL REFERENCES participants(id),
    type                     TEXT NOT NULL,
    data                     TEXT NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'pending'
                                 CHECK(status IN ('pending','answered','expired')),
    answer_data              TEXT,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    answered_at              TEXT,
    deadline                 TEXT
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
`);

// ── Migration v2: deadline column + 'expired' status ─────────────────────────
// Check whether the deadline column already exists. If not, recreate the
// questions table so the status CHECK constraint also gets updated.
// Foreign-key enforcement is temporarily disabled during the recreation.

const cols = (sqlite.pragma("table_info(questions)") as { name: string }[]).map(
    (r) => r.name,
);

if (!cols.includes("deadline")) {
    console.log("Applying migration v2: questions deadline + expired status…");
    sqlite.pragma("foreign_keys = OFF");
    sqlite.exec(`
        BEGIN;

        CREATE TABLE questions_v2 (
            id                        TEXT PRIMARY KEY,
            session_id                TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            created_by_participant_id TEXT NOT NULL REFERENCES participants(id),
            type                      TEXT NOT NULL,
            data                      TEXT NOT NULL,
            status                    TEXT NOT NULL DEFAULT 'pending'
                                          CHECK(status IN ('pending','answered','expired')),
            answer_data               TEXT,
            created_at                TEXT NOT NULL DEFAULT (datetime('now')),
            answered_at               TEXT,
            deadline                  TEXT
        );

        INSERT INTO questions_v2
            (id, session_id, created_by_participant_id, type, data, status,
             answer_data, created_at, answered_at, deadline)
        SELECT
            id, session_id, created_by_participant_id, type, data, status,
            answer_data, created_at, answered_at, NULL
        FROM questions;

        DROP TABLE questions;
        ALTER TABLE questions_v2 RENAME TO questions;

        CREATE INDEX IF NOT EXISTS idx_questions_session ON questions(session_id);

        COMMIT;
    `);
    sqlite.pragma("foreign_keys = ON");
    console.log("Migration v2 applied.");
}

// ── Migration v3: answered_by_participant_id column ──────────────────────────

if (!cols.includes("answered_by_participant_id")) {
    console.log("Applying migration v3: questions answered_by_participant_id…");
    sqlite.exec(`
        ALTER TABLE questions ADD COLUMN answered_by_participant_id TEXT;
    `);
    console.log("Migration v3 applied.");
}

console.log("Database migrated successfully:", DB_PATH);
sqlite.close();
