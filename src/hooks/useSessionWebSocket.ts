import type { ServerToClientEvent } from "@hideandseek/shared";
import { useEffect, useRef } from "react";

import {
    applyServerMapLocation,
    currentSession,
    getRole,
    hiderConnected,
    seekerCount,
    sessionQuestions,
    upsertSessionQuestion,
    wsStatus,
} from "@/lib/session-context";

const BASE_WS_URL =
    (typeof import.meta !== "undefined" &&
        (import.meta as any).env?.PUBLIC_BACKEND_WS_URL) ||
    "ws://localhost:3001";

interface Options {
    code: string;
    token: string;
    /** Called when the WS connects and first sync arrives */
    onSync?: () => void;
}

/**
 * Opens and manages a WebSocket connection to the backend session.
 * Handles reconnection with exponential back-off.
 */
export function useSessionWebSocket({ code, token, onSync }: Options): void {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectDelay = useRef(1000);
    const unmounted = useRef(false);

    useEffect(() => {
        unmounted.current = false;

        function connect() {
            if (unmounted.current) return;

            wsStatus.set("connecting");
            const ws = new WebSocket(
                `${BASE_WS_URL}/ws/${code}?token=${encodeURIComponent(token)}`,
            );
            wsRef.current = ws;

            ws.onopen = () => {
                reconnectDelay.current = 1000;
                wsStatus.set("connected");
            };

            ws.onmessage = (evt) => {
                let event: ServerToClientEvent;
                try {
                    event = JSON.parse(evt.data as string) as ServerToClientEvent;
                } catch {
                    return;
                }

                switch (event.type) {
                    case "sync": {
                        // Client-side fallback: if the server missed expiring a
                        // question (e.g. after a restart), locally mark past-deadline
                        // pending questions as expired so the UI is correct.
                        const now = Date.now();
                        const patchedQuestions = event.questions.map((q) => {
                            if (
                                q.status === "pending" &&
                                q.deadline &&
                                new Date(q.deadline).getTime() <= now
                            ) {
                                return { ...q, status: "expired" as const };
                            }
                            return q;
                        });
                        sessionQuestions.set(patchedQuestions);
                        seekerCount.set(event.seekerCount);
                        hiderConnected.set(event.hiderConnected);
                        if (event.mapLocation) {
                            applyServerMapLocation(event.mapLocation);
                        }
                        onSync?.();
                        break;
                    }

                    case "question_added":
                    case "question_answered":
                        upsertSessionQuestion(event.question);
                        break;

                    case "question_expired": {
                        // Mark the question as expired in local state.
                        // The deadline is already stored on the question; this event
                        // is the authoritative server signal that the deadline passed.
                        const current = sessionQuestions.get();
                        const idx = current.findIndex((q) => q.id === event.questionId);
                        if (idx !== -1 && current[idx].status === "pending") {
                            const updated = [...current];
                            updated[idx] = { ...updated[idx], status: "expired" };
                            sessionQuestions.set(updated);
                        }
                        break;
                    }

                    case "map_location_updated":
                        // The hider is the source of map updates via REST PATCH.
                        // The backend broadcasts to all participants (including
                        // the hider), which would create a feedback loop:
                        // hider sets location → PATCH → WS broadcast → hider sets
                        // location again → PATCH → … infinitely.
                        // Seekers still need to receive and apply these updates.
                        if (getRole() !== "hider") {
                            applyServerMapLocation(event.mapLocation);
                        }
                        break;

                    case "session_status_changed":
                        currentSession.set(
                            currentSession.get()
                                ? { ...currentSession.get()!, status: event.status }
                                : null,
                        );
                        break;

                    case "participant_joined":
                        if (event.role === "seeker") {
                            seekerCount.set(seekerCount.get() + 1);
                        } else if (event.role === "hider") {
                            hiderConnected.set(true);
                        }
                        break;

                    case "participant_left":
                        // Re-fetch counts from the next sync; we don't track
                        // individual roles on leave in this simplified model.
                        break;
                }
            };

            ws.onclose = (evt) => {
                wsStatus.set("disconnected");
                wsRef.current = null;

                // Don't reconnect if closed intentionally (code 1000) or
                // by the server for auth reasons (4401 / 4403 / 4404)
                if (
                    unmounted.current ||
                    evt.code === 1000 ||
                    evt.code === 4401 ||
                    evt.code === 4403 ||
                    evt.code === 4404
                ) {
                    return;
                }

                // Exponential back-off, max 30 s
                const delay = Math.min(reconnectDelay.current, 30_000);
                reconnectDelay.current = delay * 2;
                setTimeout(connect, delay);
            };

            ws.onerror = () => {
                ws.close();
            };
        }

        connect();

        // Keep-alive ping every 25 s
        const pingInterval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "ping" }));
            }
        }, 25_000);

        return () => {
            unmounted.current = true;
            clearInterval(pingInterval);
            wsRef.current?.close(1000, "Component unmounted");
        };
    }, [code, token]); // eslint-disable-line react-hooks/exhaustive-deps
}
