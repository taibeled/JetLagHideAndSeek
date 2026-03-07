/**
 * Typed API client for the Hide & Seek backend.
 * Reads the backend URL from import.meta.env.PUBLIC_BACKEND_URL,
 * falling back to http://localhost:3001 for local development.
 */
import type {
    AddQuestionRequest,
    AddQuestionResponse,
    AnswerQuestionRequest,
    AnswerQuestionResponse,
    CreateSessionRequest,
    CreateSessionResponse,
    GetSessionResponse,
    JoinSessionRequest,
    JoinSessionResponse,
    UpdateMapLocationRequest,
} from "@hideandseek/shared";

const BASE_URL =
    (typeof import.meta !== "undefined" &&
        (import.meta as any).env?.PUBLIC_BACKEND_URL) ||
    "";

async function apiFetch<T>(
    path: string,
    options: RequestInit & { token?: string } = {},
): Promise<T> {
    const { token, ...rest } = options;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { "x-participant-token": token } : {}),
        ...(rest.headers as Record<string, string> | undefined),
    };

    const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
            (err as any).error ?? `API error ${res.status}: ${path}`,
        );
    }

    return res.json() as Promise<T>;
}

// ── Session endpoints ─────────────────────────────────────────────────────────

export function createSession(
    body: CreateSessionRequest,
): Promise<CreateSessionResponse> {
    return apiFetch("/api/sessions", { method: "POST", body: JSON.stringify(body) });
}

export function getSession(code: string): Promise<GetSessionResponse> {
    return apiFetch(`/api/sessions/${code}`);
}

export function joinSession(
    code: string,
    body: JoinSessionRequest,
): Promise<JoinSessionResponse> {
    return apiFetch(`/api/sessions/${code}/join`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export function updateMapLocation(
    code: string,
    token: string,
    body: UpdateMapLocationRequest,
): Promise<{ ok: boolean }> {
    return apiFetch(`/api/sessions/${code}/map`, {
        method: "PATCH",
        body: JSON.stringify(body),
        token,
    });
}

// ── Question endpoints ────────────────────────────────────────────────────────

export function addQuestion(
    code: string,
    token: string,
    body: AddQuestionRequest,
): Promise<AddQuestionResponse> {
    return apiFetch(`/api/sessions/${code}/questions`, {
        method: "POST",
        body: JSON.stringify(body),
        token,
    });
}

export function answerQuestion(
    questionId: string,
    token: string,
    body: AnswerQuestionRequest,
): Promise<AnswerQuestionResponse> {
    return apiFetch(`/api/questions/${questionId}/answer`, {
        method: "POST",
        body: JSON.stringify(body),
        token,
    });
}
