/**
 * PickerHeader — reusable header for all question config screens.
 * Renders: drag pill · back button (optional) · title · WS dots · settings · close
 */
import { ChevronLeft, Settings, X } from "lucide-react";

export type WsStatus = "connected" | "connecting" | "disconnected";

function WsDots({ status }: { status: WsStatus }) {
    const color = status === "disconnected" ? "#6B7280" : "#4ADE80";
    const opacity = status === "connecting" ? 0.4 : 1;
    return (
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className={status === "connecting" ? "animate-pulse" : ""}
                    style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: color,
                        opacity,
                        animationDelay: status === "connecting" ? `${i * 0.2}s` : undefined,
                    }}
                />
            ))}
        </div>
    );
}

export interface PickerHeaderProps {
    title: string;
    wsStatus: WsStatus;
    onBack?: () => void;
    onSettings: () => void;
    onClose: () => void;
}

const ICON_BTN: React.CSSProperties = {
    width: 36,
    height: 36,
    flexShrink: 0,
    background: "var(--color-panel)",
    borderRadius: "var(--radius-default)",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

export function PickerHeader({ title, wsStatus, onBack, onSettings, onClose }: PickerHeaderProps) {
    return (
        <>
            {/* Drag pill */}
            <div style={{
                width: 48,
                height: 4,
                borderRadius: 2,
                background: "#4A5565",
                margin: "12px auto 0",
                flexShrink: 0,
            }} />

            {/* Header row */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px 8px",
                flexShrink: 0,
            }}>
                {onBack && (
                    <button onClick={onBack} aria-label="Zurück" style={ICON_BTN}>
                        <ChevronLeft size={18} color="#fff" />
                    </button>
                )}

                <span style={{
                    flex: 1,
                    color: "#fff",
                    fontSize: "17px",
                    fontWeight: 800,
                    fontFamily: "Poppins, sans-serif",
                    letterSpacing: "0.02em",
                }}>
                    {title}
                </span>

                <WsDots status={wsStatus} />

                <button onClick={onSettings} aria-label="Einstellungen" style={ICON_BTN}>
                    <Settings size={16} color="#fff" />
                </button>

                <button onClick={onClose} aria-label="Schließen" style={ICON_BTN}>
                    <X size={16} color="#fff" />
                </button>
            </div>
        </>
    );
}
