/**
 * CreateSessionOverlay — guided flow shown on app start when no active session
 * exists.
 *
 * Create flow: entry → gebiet → groesse → code → rolle
 * Join flow:   entry → join-code → rolle
 *
 * Automatically hides once sessionParticipant becomes non-null.
 */
import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Loader2, Share2 } from "lucide-react";

import { useT } from "@/i18n";
import {
    applyServerMapLocation,
    buildMapLocationFromContext,
    gameSize as gameSizeAtom,
    hiderAreaConfirmed,
    sessionCode,
    sessionParticipant,
} from "@/lib/session-context";
import { createSession, getSession, joinSession } from "@/lib/session-api";
import type { CreateSessionResponse } from "@hideandseek/shared";

import { HiderAreaSearch } from "./HiderAreaSearch";

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = "entry" | "gebiet" | "groesse" | "code" | "rolle" | "join-code";
type GameSize = "S" | "M" | "L";

// Steps used for dot indicators
const CREATE_STEPS: Step[] = ["gebiet", "groesse", "code", "rolle"];
const JOIN_STEPS: Step[] = ["join-code", "rolle"];

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    background: "var(--color-panel)",
    border: "1px solid rgba(245,245,240,0.1)",
    borderRadius: "var(--radius-default)",
    color: "#fff",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
};

const btnBase: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    border: "none",
    borderRadius: "var(--radius-default)",
    color: "#fff",
    fontWeight: 700,
    fontSize: "15px",
    cursor: "pointer",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    textAlign: "center",
    lineHeight: 1.3,
};

const btnPrimary: React.CSSProperties = { ...btnBase, background: "var(--color-primary)" };
const btnSecondary: React.CSSProperties = { ...btnBase, background: "var(--color-panel)", fontWeight: 600, fontSize: "14px" };
const btnDisabled: React.CSSProperties = { opacity: 0.4, cursor: "not-allowed" };

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepDots({ step, isJoinFlow }: { step: Step; isJoinFlow: boolean }) {
    const steps = isJoinFlow ? JOIN_STEPS : CREATE_STEPS;
    const idx = steps.indexOf(step);
    if (idx === -1) return null;
    return (
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {steps.map((_, i) => (
                <div
                    key={i}
                    style={{
                        width: i === idx ? 8 : 6,
                        height: i === idx ? 8 : 6,
                        borderRadius: "50%",
                        background: i <= idx ? "var(--color-primary)" : "rgba(245,245,240,0.25)",
                        transition: "all 0.2s",
                        flexShrink: 0,
                    }}
                />
            ))}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CreateSessionOverlay() {
    const $participant = useStore(sessionParticipant);
    const $hiderConfirmed = useStore(hiderAreaConfirmed);

    const [step, setStep] = useState<Step>("entry");
    const [displayName, setDisplayName] = useState("");
    const [gameSize, setGameSize] = useState<GameSize | null>(null);
    const [joinCode, setJoinCode] = useState("");
    const [createdSession, setCreatedSession] = useState<CreateSessionResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isJoinFlow, setIsJoinFlow] = useState(false);
    const [copied, setCopied] = useState(false);

    const tr = useT();

    // Auto-advance from gebiet when area confirmed
    useEffect(() => {
        if (step === "gebiet" && $hiderConfirmed) {
            setStep("groesse");
        }
    }, [$hiderConfirmed, step]);

    // Don't render when already in a session
    if ($participant !== null) return null;

    // ── Session API calls ────────────────────────────────────────────────────

    async function handleCreateSession() {
        setLoading(true);
        setError(null);
        setCreatedSession(null);
        try {
            const mapLocation = buildMapLocationFromContext();
            const result = await createSession({
                displayName: displayName.trim(),
                mapLocation: mapLocation ?? undefined,
            });
            setCreatedSession(result);
        } catch (e: unknown) {
            setError((e as Error).message ?? "Fehler beim Erstellen der Session");
        } finally {
            setLoading(false);
        }
    }

    async function handleSelectRole(role: "hider" | "seeker") {
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            if (isJoinFlow) {
                // Reset stale gameSize from a previous session so every
                // category is visible until the backend syncs the real value.
                gameSizeAtom.set(null);

                const code = joinCode.toUpperCase();
                const result = await joinSession(code, { displayName: displayName.trim(), role });
                const sessionData = await getSession(code);
                if (sessionData.session.mapLocation) {
                    applyServerMapLocation(sessionData.session.mapLocation);
                }
                sessionCode.set(result.session.code);
                sessionParticipant.set(result.participant);
            } else {
                if (!createdSession) return;
                if (role === "hider") {
                    sessionCode.set(createdSession.session.code);
                    sessionParticipant.set(createdSession.participant);
                } else {
                    // Creator wants to be seeker: join own session under seeker role
                    const joinResult = await joinSession(createdSession.session.code, {
                        displayName: displayName.trim(),
                        role: "seeker",
                    });
                    sessionCode.set(createdSession.session.code);
                    sessionParticipant.set(joinResult.participant);
                }
            }
        } catch (e: unknown) {
            setError((e as Error).message ?? "Fehler");
            setLoading(false);
        }
    }

    // ── Clipboard / Share ────────────────────────────────────────────────────

    function handleCopy() {
        if (!createdSession) return;
        navigator.clipboard.writeText(createdSession.session.code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    function handleShare() {
        if (!createdSession) return;
        const code = createdSession.session.code;
        if (typeof navigator !== "undefined" && navigator.share) {
            navigator.share({ title: "JetLag Hide & Seek", text: `Session-Code: ${code}` });
        } else {
            navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    }

    // ── Layout helpers ───────────────────────────────────────────────────────

    function Header({
        title,
        showBack = false,
        onBack,
    }: {
        title: string;
        showBack?: boolean;
        onBack?: () => void;
    }) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                {showBack ? (
                    <button
                        onClick={onBack}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "rgba(245,245,240,0.7)",
                            padding: "4px 8px 4px 0",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: "13px",
                            flexShrink: 0,
                        }}
                    >
                        <ArrowLeft size={15} />
                        {tr("overlay.back")}
                    </button>
                ) : (
                    // Spacer to keep title right-aligned consistently
                    <div style={{ width: 60, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                    <StepDots step={step} isJoinFlow={isJoinFlow} />
                </div>
                <span style={{
                    color: "rgba(245,245,240,0.75)",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    flexShrink: 0,
                    minWidth: 60,
                    textAlign: "right",
                }}>
                    {title}
                </span>
            </div>
        );
    }

    // ── Step renderers ───────────────────────────────────────────────────────

    function renderEntry() {
        const canProceed = displayName.trim().length > 0;
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                    <h2 style={{
                        color: "#fff",
                        fontSize: "24px",
                        fontWeight: 800,
                        fontFamily: "Poppins, sans-serif",
                        margin: "0 0 4px",
                        letterSpacing: "0.01em",
                    }}>
                        JetLag
                    </h2>
                    <p style={{ color: "rgba(245,245,240,0.55)", fontSize: "13px", margin: 0 }}>
                        Hide &amp; Seek
                    </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ color: "rgba(245,245,240,0.7)", fontSize: "13px", fontWeight: 600 }}>
                        {tr("overlay.nameLabel")}
                    </label>
                    <input
                        style={inputStyle}
                        placeholder={tr("overlay.namePlaceholder")}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        maxLength={32}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canProceed) {
                                hiderAreaConfirmed.set(false);
                                setIsJoinFlow(false);
                                setStep("gebiet");
                            }
                        }}
                    />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                        style={{ ...btnPrimary, ...(canProceed ? {} : btnDisabled) }}
                        disabled={!canProceed}
                        onClick={() => {
                            hiderAreaConfirmed.set(false);
                            setIsJoinFlow(false);
                            setStep("gebiet");
                        }}
                    >
                        {tr("overlay.newGame")}
                    </button>
                    <button
                        style={{ ...btnSecondary, ...(canProceed ? {} : btnDisabled) }}
                        disabled={!canProceed}
                        onClick={() => {
                            setIsJoinFlow(true);
                            setStep("join-code");
                        }}
                    >
                        {tr("overlay.joinGame")}
                    </button>
                </div>
            </div>
        );
    }

    function renderGebiet() {
        function handleBack() {
            hiderAreaConfirmed.set(false);
            setStep("entry");
        }
        return (
            <div>
                <Header title={tr("overlay.stepArea")} showBack onBack={handleBack} />
                <HiderAreaSearch onBack={handleBack} />
            </div>
        );
    }

    function renderGroesse() {
        const sizes: Array<{ key: GameSize; label: string }> = [
            { key: "S", label: tr("overlay.sizeS") },
            { key: "M", label: tr("overlay.sizeM") },
            { key: "L", label: tr("overlay.sizeL") },
        ];
        return (
            <div>
                <Header
                    title={tr("overlay.stepSize")}
                    showBack
                    onBack={() => {
                        hiderAreaConfirmed.set(false);
                        setStep("gebiet");
                    }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {sizes.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setGameSize(key)}
                            style={{
                                padding: "14px 16px",
                                background: gameSize === key ? "var(--color-primary)" : "var(--color-panel)",
                                border: `2px solid ${gameSize === key ? "var(--color-primary)" : "rgba(245,245,240,0.08)"}`,
                                borderRadius: "var(--radius-default)",
                                color: "#fff",
                                fontWeight: gameSize === key ? 700 : 500,
                                fontSize: "15px",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 0.15s",
                            }}
                        >
                            {label}
                        </button>
                    ))}
                    <button
                        style={{ ...btnPrimary, marginTop: 8, ...(gameSize ? {} : btnDisabled) }}
                        disabled={!gameSize}
                        onClick={() => {
                            gameSizeAtom.set(gameSize);
                            setStep("code");
                            handleCreateSession();
                        }}
                    >
                        {tr("overlay.next")} →
                    </button>
                </div>
            </div>
        );
    }

    function renderCode() {
        const code = createdSession?.session.code ?? "";

        if (loading) {
            return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 48 }}>
                    <Loader2 size={36} className="animate-spin" style={{ color: "var(--color-primary)" }} />
                    <p style={{ color: "rgba(245,245,240,0.6)", fontSize: "14px", margin: 0 }}>
                        {tr("overlay.creatingSession")}
                    </p>
                </div>
            );
        }

        if (error) {
            return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ color: "var(--color-primary)", fontSize: "14px", margin: 0 }}>{error}</p>
                    <button
                        style={btnSecondary}
                        onClick={() => { setError(null); setStep("groesse"); }}
                    >
                        ← {tr("overlay.back")}
                    </button>
                    <button
                        style={btnPrimary}
                        onClick={() => { setError(null); handleCreateSession(); }}
                    >
                        {tr("overlay.retryCreate")}
                    </button>
                </div>
            );
        }

        return (
            <div>
                <Header title={tr("overlay.stepCode")} />
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Code display */}
                    <div>
                        <p style={{ color: "rgba(245,245,240,0.6)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 10px" }}>
                            {tr("overlay.codeTitle")}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                                flex: 1,
                                padding: "18px 12px",
                                background: "var(--color-panel)",
                                borderRadius: "var(--radius-default)",
                                fontSize: "30px",
                                fontFamily: "monospace",
                                fontWeight: 700,
                                letterSpacing: "0.35em",
                                color: "#fff",
                                textAlign: "center",
                            }}>
                                {code}
                            </div>
                            <button
                                onClick={handleCopy}
                                aria-label={tr("overlay.codeCopy")}
                                style={{
                                    width: 44,
                                    height: 44,
                                    flexShrink: 0,
                                    background: "var(--color-panel)",
                                    border: "none",
                                    borderRadius: "var(--radius-default)",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: copied ? "var(--color-primary)" : "#fff",
                                    transition: "color 0.2s",
                                }}
                            >
                                <Copy size={18} />
                            </button>
                            {typeof navigator !== "undefined" && "share" in navigator && (
                                <button
                                    onClick={handleShare}
                                    aria-label={tr("overlay.codeShare")}
                                    style={{
                                        width: 44,
                                        height: 44,
                                        flexShrink: 0,
                                        background: "var(--color-panel)",
                                        border: "none",
                                        borderRadius: "var(--radius-default)",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "#fff",
                                    }}
                                >
                                    <Share2 size={18} />
                                </button>
                            )}
                        </div>
                        {copied && (
                            <p style={{ color: "var(--color-primary)", fontSize: "12px", margin: "6px 0 0", textAlign: "center" }}>
                                {tr("overlay.codeCopied")}
                            </p>
                        )}
                    </div>

                    {/* Hint */}
                    <p style={{
                        color: "rgba(245,245,240,0.65)",
                        fontSize: "13px",
                        background: "rgba(232,50,58,0.08)",
                        borderRadius: "var(--radius-default)",
                        padding: "10px 14px",
                        border: "1px solid rgba(232,50,58,0.2)",
                        margin: 0,
                    }}>
                        💡 {tr("overlay.codeHint")}
                    </p>

                    <button style={btnPrimary} onClick={() => setStep("rolle")}>
                        {tr("overlay.stepRole")} →
                    </button>
                </div>
            </div>
        );
    }

    function renderRolle() {
        const roles = [
            {
                key: "hider" as const,
                name: tr("overlay.roleName.hider"),
                desc: tr("overlay.roleDesc.hider"),
                primary: true,
            },
            {
                key: "seeker" as const,
                name: tr("overlay.roleName.seeker"),
                desc: tr("overlay.roleDesc.seeker"),
                primary: false,
            },
        ];

        return (
            <div>
                <Header
                    title={tr("overlay.stepRole")}
                    showBack={isJoinFlow}
                    onBack={isJoinFlow ? () => setStep("join-code") : undefined}
                />
                {error && (
                    <p style={{ color: "var(--color-primary)", fontSize: "13px", marginBottom: 14 }}>{error}</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {roles.map(({ key, name, desc, primary }) => (
                        <button
                            key={key}
                            disabled={loading}
                            onClick={() => handleSelectRole(key)}
                            style={{
                                padding: "16px",
                                background: primary ? "var(--color-primary)" : "var(--color-panel)",
                                border: "none",
                                borderRadius: "var(--radius-default)",
                                color: "#fff",
                                cursor: loading ? "not-allowed" : "pointer",
                                textAlign: "left",
                                opacity: loading ? 0.6 : 1,
                                transition: "opacity 0.15s",
                            }}
                        >
                            <div style={{ fontWeight: 700, fontSize: "16px" }}>{name}</div>
                            <div style={{ fontWeight: 400, fontSize: "13px", marginTop: 4, opacity: 0.8 }}>{desc}</div>
                        </button>
                    ))}
                    {loading && (
                        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                            <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-primary)" }} />
                        </div>
                    )}
                </div>
            </div>
        );
    }

    function renderJoinCode() {
        const canProceed = joinCode.trim().length === 6;
        return (
            <div>
                <Header
                    title={tr("overlay.joinCode")}
                    showBack
                    onBack={() => { setIsJoinFlow(false); setStep("entry"); }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <input
                        style={{
                            ...inputStyle,
                            fontFamily: "monospace",
                            fontSize: "28px",
                            letterSpacing: "0.35em",
                            textAlign: "center",
                            textTransform: "uppercase",
                            padding: "16px",
                        }}
                        placeholder={tr("overlay.joinCodePlaceholder")}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                        maxLength={6}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canProceed) setStep("rolle");
                        }}
                    />
                    <button
                        style={{ ...btnPrimary, ...(canProceed ? {} : btnDisabled) }}
                        disabled={!canProceed}
                        onClick={() => setStep("rolle")}
                    >
                        {tr("overlay.next")} →
                    </button>
                </div>
            </div>
        );
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div
            className="hs-bottom-sheet"
            style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                height: "80vh",
                zIndex: 1005,
                background: "var(--color-dark)",
                borderTop: "3px solid var(--color-primary)",
                borderRadius: "12px 12px 0 0",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
        >
            {/* Drag pill */}
            <div style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                background: "rgba(245,245,240,0.25)",
                margin: "12px auto 0",
                flexShrink: 0,
            }} />

            {/* Scrollable content */}
            <div style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                padding: "20px 20px 40px",
                scrollbarWidth: "thin",
                scrollbarColor: "var(--color-primary) transparent",
            }}>
                {step === "entry"     && renderEntry()}
                {step === "gebiet"    && renderGebiet()}
                {step === "groesse"   && renderGroesse()}
                {step === "code"      && renderCode()}
                {step === "rolle"     && renderRolle()}
                {step === "join-code" && renderJoinCode()}
            </div>
        </div>
    );
}
