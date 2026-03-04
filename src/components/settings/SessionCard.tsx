import { useStore } from "@nanostores/react";
import { useT } from "@/i18n";
import {
    sessionCode,
    sessionParticipant,
    leaveSession,
} from "@/lib/session-context";

export function SessionCard() {
    const tr = useT();
    const $code = useStore(sessionCode);
    const $participant = useStore(sessionParticipant);

    if (!$participant || !$code) return null;

    const roleName = $participant.role === "hider"
        ? tr("session.hider")
        : tr("session.seeker");

    return (
        <div
            style={{
                background: "var(--color-panel)",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 8,
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                }}
            >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ color: "#99A1AF", fontSize: 14 }}>
                        {tr("session.label")}
                    </span>
                    <span
                        style={{
                            color: "#fff",
                            fontSize: 22,
                            fontWeight: 800,
                            fontFamily: "'Poppins', sans-serif",
                            letterSpacing: "0.04em",
                        }}
                    >
                        {$code}
                    </span>
                </div>
                <button
                    onClick={() => leaveSession()}
                    style={{
                        background: "var(--hs-dark)",
                        border: "1px solid rgba(245,245,240,0.15)",
                        borderRadius: 8,
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        padding: "6px 14px",
                        cursor: "pointer",
                    }}
                >
                    {tr("session.leave")}
                </button>
            </div>
            <div style={{ color: "#99A1AF", fontSize: 13 }}>
                {tr("session.youAre")}{" "}
                <span style={{ color: "#fff", fontWeight: 600 }}>{roleName}</span>
                {$participant.displayName && (
                    <>
                        {" · "}
                        <span style={{ color: "#fff" }}>{$participant.displayName}</span>
                    </>
                )}
            </div>
        </div>
    );
}
