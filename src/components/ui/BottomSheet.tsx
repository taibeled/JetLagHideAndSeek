/**
 * BottomSheet — Sliding panel that replaces the left sidebar.
 *
 * States:
 *   collapsed  ~80px  — handle + title only, map fully interactive
 *   default    ~35vh  — standard view
 *   expanded   ~75vh  — full content / long lists
 *
 * Swipe up/down on the drag handle changes state.
 * Tap on the Leaflet map collapses the sheet (handled in Map.tsx).
 *
 * Desktop (≥ 768px): fixed bottom-center, max-width 480px.
 * Mobile:            full viewport width.
 */
import { useStore } from "@nanostores/react";
import { Settings } from "lucide-react";
import { useRef } from "react";

import { bottomSheetState } from "@/lib/bottom-sheet-state";
import type { SheetState } from "@/lib/bottom-sheet-state";

// ── Hex background pattern (SVG data-URI) ────────────────────────────────
const HEX_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='52'%3E%3Cpolygon points='30,2 58,16 58,44 30,50 2,44 2,16' fill='none' stroke='%23E8323A' stroke-width='1' stroke-opacity='0.15'/%3E%3C/svg%3E")`;

// ── Heights per state ─────────────────────────────────────────────────────
const HEIGHT: Record<SheetState, string> = {
    collapsed: "80px",
    default:   "35vh",
    expanded:  "75vh",
};

const SWIPE_THRESHOLD = 40; // px — minimum drag distance to trigger a state change

// ── Transitions between states ────────────────────────────────────────────
const NEXT_UP: Partial<Record<SheetState, SheetState>> = {
    collapsed: "default",
    default:   "expanded",
};
const NEXT_DOWN: Partial<Record<SheetState, SheetState>> = {
    expanded: "default",
    default:  "collapsed",
};

// ── Component ─────────────────────────────────────────────────────────────

interface BottomSheetProps {
    children: React.ReactNode;
    title?: string;
    onSettingsClick?: () => void;
    onTitleClick?: () => void;
}

export function BottomSheet({ children, title, onSettingsClick, onTitleClick }: BottomSheetProps) {
    const state = useStore(bottomSheetState);
    const dragStartY = useRef<number | null>(null);
    const isDragging = useRef(false);

    // ── Pointer / swipe handlers on the drag handle ──────────────────────
    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        // Don't intercept clicks on interactive children (buttons)
        if ((e.target as HTMLElement).closest("button")) return;
        dragStartY.current = e.clientY;
        isDragging.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (dragStartY.current === null) return;
        if (Math.abs(e.clientY - dragStartY.current) > 8) {
            isDragging.current = true;
        }
    }

    function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
        if (dragStartY.current === null) return;
        const delta = dragStartY.current - e.clientY; // positive = swipe up

        if (!isDragging.current) {
            // Pure tap: toggle collapsed ↔ default
            if (state === "collapsed") bottomSheetState.set("default");
        } else if (delta > SWIPE_THRESHOLD) {
            const next = NEXT_UP[state];
            if (next) bottomSheetState.set(next);
        } else if (delta < -SWIPE_THRESHOLD) {
            const next = NEXT_DOWN[state];
            if (next) bottomSheetState.set(next);
        }

        dragStartY.current = null;
        isDragging.current = false;
    }

    function onPointerCancel() {
        dragStartY.current = null;
        isDragging.current = false;
    }

    return (
        <div
            style={{
                // Positioning
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                // Desktop: center + constrain width
                // Inline style used because Tailwind can't compute md breakpoint here;
                // the md override is done via a CSS class below.
                height: HEIGHT[state],
                // Design system
                background: "var(--hs-dark)",
                borderTop: "3px solid var(--hs-primary)",
                borderRadius: "12px 12px 0 0",
                // Stack above Leaflet (z ~400–1000), below ZoneSidebar trigger (z 1030)
                zIndex: 1001,
                // Layout
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
            // Desktop centering via CSS class (applied globally)
            className="hs-bottom-sheet"
        >
            {/* ── Drag handle ──────────────────────────────────────────────────── */}
            <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                style={{
                    cursor: "grab",
                    touchAction: "none",
                    userSelect: "none",
                    // Hex background pattern in header
                    backgroundImage: HEX_PATTERN,
                    backgroundRepeat: "repeat",
                    padding: "8px 16px 10px",
                    flexShrink: 0,
                }}
            >
                {/* Pill */}
                <div
                    style={{
                        width: 40,
                        height: 4,
                        borderRadius: 2,
                        background: "rgba(245,245,240,0.30)",
                        margin: "0 auto 8px",
                    }}
                />
                {/* Action row — Figma node 1:29 + 1:31 */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {title && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onTitleClick) {
                                    onTitleClick();
                                } else {
                                    bottomSheetState.set(state === "collapsed" ? "default" : "collapsed");
                                }
                            }}
                            style={{
                                flex: 1,
                                background: "var(--color-primary)",
                                borderRadius: "var(--radius-pill)",
                                border: "none",
                                cursor: "pointer",
                                padding: "10px 16px",
                                color: "#fff",
                                fontWeight: 800,
                                fontSize: "15px",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                textAlign: "left",
                                lineHeight: 1.2,
                            }}
                        >
                            {title}
                        </button>
                    )}
                    {onSettingsClick && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSettingsClick();
                            }}
                            aria-label="Einstellungen"
                            style={{
                                width: 40,
                                height: 40,
                                flexShrink: 0,
                                background: "var(--color-panel)",
                                borderRadius: "var(--radius-default)",
                                border: "none",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Settings size={18} color="#fff" />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Scrollable content ───────────────────────────────────────────── */}
            {state !== "collapsed" && (
                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        overflowX: "hidden",
                        padding: "0 4px 16px",
                        // Custom scrollbar
                        scrollbarWidth: "thin",
                        scrollbarColor: "var(--hs-primary) transparent",
                    }}
                >
                    {children}
                </div>
            )}
        </div>
    );
}
