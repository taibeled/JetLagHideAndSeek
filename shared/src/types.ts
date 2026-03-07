import { z } from "zod";

// ── Map defaults ──────────────────────────────────────────────────────────────

/**
 * Default map viewport shown on first load (no session / no saved location).
 * Center is the geographic midpoint of Germany; zoom 6 shows the whole country.
 */
export const DEFAULT_VIEWPORT = {
    center: [51.1, 10.4] as [number, number],
    zoom: 6,
} as const;

// ── Session ──────────────────────────────────────────────────────────────────

export const sessionStatusSchema = z.enum(["waiting", "active", "finished"]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const roleSchema = z.enum(["hider", "seeker"]);
export type Role = z.infer<typeof roleSchema>;

export interface Session {
    id: string;
    code: string;
    status: SessionStatus;
    mapLocation: MapLocation | null;
    createdAt: string;
    expiresAt: string;
}

export interface MapLocation {
    lat: number;
    lng: number;
    name: string;
    /** Full OSM Feature object for the primary zone */
    osmFeature?: unknown;
    /** Additional OSM zones selected by the hider (preserved across session join) */
    additionalOsmFeatures?: { location: unknown; added: boolean }[];
}

// ── Participant ───────────────────────────────────────────────────────────────

export interface Participant {
    id: string;
    sessionId: string;
    role: Role;
    displayName: string;
    joinedAt: string;
}

/** Returned only to the joining participant – never broadcast */
export interface ParticipantWithToken extends Participant {
    token: string;
}

// ── Question ──────────────────────────────────────────────────────────────────

/** Duration in milliseconds before an unanswered question expires (5 minutes). */
export const QUESTION_DEADLINE_MS = 5 * 60 * 1000;

export const questionStatusSchema = z.enum(["pending", "answered", "expired"]);
export type QuestionStatus = z.infer<typeof questionStatusSchema>;

/**
 * QuestionData mirrors the existing frontend Question type from schema.ts.
 * We keep it as `unknown` here so shared/ has no dependency on the full
 * frontend schema logic; each side validates with its own Zod schemas.
 */
export interface SessionQuestion {
    id: string;
    sessionId: string;
    createdByParticipantId: string;
    /** Question type: "radius" | "thermometer" | "tentacles" | "matching" | "measuring" */
    type: string;
    /** Raw question data – matches the frontend Question schema */
    data: unknown;
    status: QuestionStatus;
    /** Present once the hider has answered */
    answerData?: unknown;
    createdAt: string;
    answeredAt?: string;
    /** ISO8601 deadline after which the question expires. Set server-side at creation time. */
    deadline?: string;
    /** Participant who answered the question (hider) */
    answeredByParticipantId?: string;
    /** Display name of the participant who created the question */
    createdByDisplayName?: string;
    /** Display name of the participant who answered the question */
    answeredByDisplayName?: string;
}

// ── HTTP request / response bodies ───────────────────────────────────────────

export interface CreateSessionRequest {
    displayName: string;
    mapLocation?: MapLocation;
}

export interface CreateSessionResponse {
    session: Session;
    participant: ParticipantWithToken;
}

export interface JoinSessionRequest {
    displayName: string;
    role?: "hider" | "seeker";
}

export interface JoinSessionResponse {
    session: Session;
    participant: ParticipantWithToken;
}

export interface GetSessionResponse {
    session: Session;
    questions: SessionQuestion[];
    /** Number of seekers currently connected */
    seekerCount: number;
    /** Whether the hider is connected */
    hiderConnected: boolean;
}

export interface AddQuestionRequest {
    /** Question type */
    type: string;
    /** Raw question data from frontend schema */
    data: unknown;
}

export interface AddQuestionResponse {
    question: SessionQuestion;
}

export interface AnswerQuestionRequest {
    /** Modified question data after GPS-based computation */
    answerData: unknown;
}

export interface AnswerQuestionResponse {
    question: SessionQuestion;
}

export interface UpdateMapLocationRequest {
    mapLocation: MapLocation;
}
