"use client";
import { useStore } from "@nanostores/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSession, getSession, joinSession } from "@/lib/session-api";
import { useT } from "@/i18n";
import {
    applyServerMapLocation,
    buildMapLocationFromContext,
    currentSession,
    leaveSession,
    pendingRole,
    sessionCode,
    sessionParticipant,
} from "@/lib/session-context";
import { SessionQuestionPanel } from "./SessionQuestionPanel";

type View = "idle" | "create" | "join" | "active";

export function SessionManager() {
    const tr = useT();
    const participant = useStore(sessionParticipant);
    const code = useStore(sessionCode);

    const [view, setView] = useState<View>(() => {
        if (participant && code) return "active";
        // Auto-open the correct dialog when the user has already chosen a role
        const role = pendingRole.get();
        if (role === "hider") return "create";
        if (role === "seeker") return "join";
        return "idle";
    });
    const [displayName, setDisplayName] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    async function handleCreate() {
        if (!displayName.trim()) return;
        setLoading(true);
        setError(null);
        try {
            // Include the current map location so seekers see the right map immediately
            const mapLocation = buildMapLocationFromContext();
            const res = await createSession({
                displayName: displayName.trim(),
                mapLocation: mapLocation ?? undefined,
            });
            sessionParticipant.set(res.participant);
            sessionCode.set(res.session.code);
            currentSession.set(res.session);
            setView("active");
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    async function handleJoin() {
        if (!displayName.trim() || !joinCode.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const normalized = joinCode.trim().toUpperCase();
            const [res, full] = await Promise.all([
                joinSession(normalized, { displayName: displayName.trim() }),
                getSession(normalized),
            ]);
            sessionParticipant.set(res.participant);
            sessionCode.set(normalized);
            currentSession.set(full.session);

            // Apply the hider's map location immediately – before the WS sync arrives
            if (full.session.mapLocation) {
                applyServerMapLocation(full.session.mapLocation as any);
            }

            setView("active");
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    function copyCode() {
        if (!code) return;
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    // ── Active session bar ─────────────────────────────────────────────────────
    if (view === "active" && participant && code) {
        // Seeker: only the question config panel (no session info bar)
        if (participant.role === "seeker") {
            return <SessionQuestionPanel />;
        }

        // Hider: session info — sheet is collapsed in BottomSheetPanel when in session,
        // so this branch is only reached transiently. Full hider UI lives in
        // QuestionPickerSheet (opened via the FRAGEN button).
        return (
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">{tr("session.label")}</span>
                    <button
                        onClick={copyCode}
                        className="font-mono font-bold tracking-widest text-sm bg-muted px-2 py-0.5 rounded hover:bg-muted/80 transition-colors"
                        title={tr("session.clickToCopy")}
                    >
                        {code}
                    </button>
                    {copied && (
                        <span className="text-xs text-green-600">{tr("session.copied")}</span>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            leaveSession();
                            setView("idle");
                        }}
                    >
                        {tr("session.leave")}
                    </Button>
                </div>
            </div>
        );
    }

    // ── Idle ───────────────────────────────────────────────────────────────────
    return (
        <>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setError(null);
                        setView("create");
                    }}
                >
                    {tr("session.create")}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setError(null);
                        setView("join");
                    }}
                >
                    {tr("session.join")}
                </Button>
            </div>

            {/* Create dialog */}
            <Dialog
                open={view === "create"}
                onOpenChange={(o) => { if (!o) { pendingRole.set(null); setView("idle"); } }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{tr("session.createTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 mt-2">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="create-name">{tr("session.yourNameHider")}</Label>
                            <Input
                                id="create-name"
                                placeholder={tr("session.namePlaceholder")}
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                onKeyDown={(e) =>
                                    e.key === "Enter" && handleCreate()
                                }
                            />
                        </div>
                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}
                        <Button
                            onClick={handleCreate}
                            disabled={loading || !displayName.trim()}
                        >
                            {loading ? tr("session.creating") : tr("session.startSession")}
                        </Button>
                        <button
                            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                            onClick={() => { pendingRole.set(null); setView("idle"); }}
                        >
                            {tr("role.back")}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Join dialog */}
            <Dialog
                open={view === "join"}
                onOpenChange={(o) => { if (!o) { pendingRole.set(null); setView("idle"); } }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{tr("session.joinTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 mt-2">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="join-code">{tr("session.invitationCode")}</Label>
                            <Input
                                id="join-code"
                                placeholder="z.B. ABC123"
                                value={joinCode}
                                onChange={(e) =>
                                    setJoinCode(e.target.value.toUpperCase())
                                }
                                maxLength={6}
                                className="font-mono tracking-widest uppercase"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="join-name">{tr("session.yourNameSeeker")}</Label>
                            <Input
                                id="join-name"
                                placeholder={tr("session.namePlaceholder")}
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                onKeyDown={(e) =>
                                    e.key === "Enter" && handleJoin()
                                }
                            />
                        </div>
                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}
                        <Button
                            onClick={handleJoin}
                            disabled={
                                loading ||
                                !displayName.trim() ||
                                joinCode.length !== 6
                            }
                        >
                            {loading ? tr("session.joining") : tr("session.joinButton")}
                        </Button>
                        <button
                            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                            onClick={() => { pendingRole.set(null); setView("idle"); }}
                        >
                            {tr("role.back")}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
