/**
 * QuestionPickerSheet — overlays the BottomSheet when the seeker wants to
 * ask a new question.
 *
 * Category list:
 *   Tab "Neue Frage"  — category cards, filtered by gameSize atom
 *   Tab "Verlauf"     — compact history of sessionQuestions
 *
 * When a category is selected, navigates to the question-specific config screen:
 *   "radius"      → RadiusConfig (GPS + manual modes)
 *   "tentacles"   → TentaclesConfig (category dropdown + radius chips + POI preview)
 *   "thermometer" → ThermometerConfig (GPS + manual modes)
 *   all others    → sets pendingPickerType → SessionQuestionPanel picks it up
 *
 * Visibility: controlled by the pickerOpen atom.
 */
import { useStore } from "@nanostores/react";
import { History, PlusCircle } from "lucide-react";
import { useState } from "react";

import { useT } from "@/i18n";
import { bottomSheetState, pendingPickerType, pickerOpen } from "@/lib/bottom-sheet-state";
import {
    gameSize,
    leaveSession,
    sessionCode,
    sessionParticipant,
    sessionQuestions,
    wsStatus,
} from "@/lib/session-context";
import { OptionDrawers } from "@/components/OptionDrawers";
import { PickerHeader } from "./picker/PickerHeader";
import { RadiusConfig } from "./picker/RadiusConfig";
import { QuestionList, SessionQuestionPanel } from "./SessionQuestionPanel";
import { TentaclesConfig } from "./picker/TentaclesConfig";
import { ThermometerConfig } from "./picker/ThermometerConfig";

// ── Category definitions ──────────────────────────────────────────────────────

type CategoryDef = {
    type: string;
    disabled?: boolean;
    sizes: ("S" | "M" | "L")[];
};

const CATEGORIES: CategoryDef[] = [
    { type: "radius",      sizes: ["S", "M", "L"] },
    { type: "thermometer", sizes: ["S", "M", "L"] },
    { type: "tentacles",   sizes: ["S", "M", "L"] },
    { type: "matching",    sizes: ["M", "L"] },
    { type: "measuring",   sizes: ["S", "M", "L"] },
    { type: "photo",       sizes: ["S", "M", "L"], disabled: true },
];

// ── Main component ────────────────────────────────────────────────────────────

export function QuestionPickerSheet() {
    const $open = useStore(pickerOpen);
    const $participant = useStore(sessionParticipant);
    const $code = useStore(sessionCode);
    const $wsStatus = useStore(wsStatus);
    const $gameSize = useStore(gameSize);
    const $questions = useStore(sessionQuestions);

    const [tab, setTab] = useState<"picker" | "history">("picker");
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<string | null>(null);

    const tr = useT();

    // Bail completely when not in a session — but NOT when picker is merely closed,
    // so that sub-configs (and their Leaflet markers) stay mounted while sheet is hidden.
    if (!$participant) return null;

    // Filter categories by game size
    const visibleCategories = CATEGORIES.filter(
        (c) => $gameSize === null || c.sizes.includes($gameSize),
    );

    function closePicker() {
        pickerOpen.set(false);
        bottomSheetState.set("collapsed");
        // Intentionally NOT resetting selectedType here — the config persists
        // so the user can reopen the picker and continue where they left off.
        // Leaflet markers from sub-configs also remain on the map.
    }

    /** Called by sub-configs after a question has been successfully staged. */
    function handleSubmitDone() {
        // Reset to category list — the question is done.
        // Resetting selectedType unmounts the sub-config, which triggers its
        // useEffect cleanup and removes any live preview markers from the map.
        setSelectedType(null);
    }

    function handleSelectType(type: string) {
        if (type === "thermometer" || type === "radius" || type === "tentacles") {
            setSelectedType(type);
            return;
        }
        pickerOpen.set(false);
        bottomSheetState.set("default");
        pendingPickerType.set(type);
    }

    function goBack() {
        setSelectedType(null);
    }

    return (
        <>
            <div
                className="hs-bottom-sheet"
                style={{
                    position: "fixed",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "75vh",
                    zIndex: 1010,
                    background: "var(--hs-dark)",
                    borderTop: "3px solid var(--color-primary)",
                    borderRadius: "12px 12px 0 0",
                    // Use display instead of unmounting so sub-configs and their
                    // Leaflet markers stay alive when the picker is merely hidden.
                    display: $open ? "flex" : "none",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                {/* ── Tentacles config sub-view ──────────────────────────── */}
                {selectedType === "tentacles" && (
                    <TentaclesConfig
                        wsStatus={$wsStatus}
                        onBack={goBack}
                        onSettings={() => setOptionsOpen(true)}
                        onClose={closePicker}
                        onDone={handleSubmitDone}
                    />
                )}

                {/* ── Radius config sub-view ─────────────────────────────── */}
                {selectedType === "radius" && (
                    <RadiusConfig
                        wsStatus={$wsStatus}
                        onBack={goBack}
                        onSettings={() => setOptionsOpen(true)}
                        onClose={closePicker}
                        onDone={handleSubmitDone}
                    />
                )}

                {/* ── Thermometer config sub-view ────────────────────────── */}
                {selectedType === "thermometer" && (
                    <ThermometerConfig
                        wsStatus={$wsStatus}
                        onBack={goBack}
                        onSettings={() => setOptionsOpen(true)}
                        onClose={closePicker}
                        onDone={handleSubmitDone}
                    />
                )}

                {/* ── Category list / history ────────────────────────────── */}
                {selectedType === null && (
                    <>
                        <PickerHeader
                            title={tr("picker.title")}
                            wsStatus={$wsStatus}
                            onSettings={() => setOptionsOpen(true)}
                            onClose={closePicker}
                        />

                        {/* Session info strip — hider only */}
                        {$participant.role === "hider" && (
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 16px 10px",
                                borderBottom: "1px solid rgba(245,245,240,0.08)",
                                flexShrink: 0,
                            }}>
                                <span style={{ color: "#6B7280", fontSize: "12px" }}>
                                    {tr("session.label")}
                                </span>
                                <span style={{
                                    fontFamily: "monospace",
                                    fontWeight: 700,
                                    fontSize: "14px",
                                    color: "#fff",
                                    letterSpacing: "0.1em",
                                    flex: 1,
                                }}>
                                    {$code}
                                </span>
                                <button
                                    onClick={() => { leaveSession(); pickerOpen.set(false); }}
                                    style={{
                                        fontSize: "12px",
                                        color: "#D56062",
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                        padding: "2px 4px",
                                    }}
                                >
                                    {tr("session.leave")}
                                </button>
                            </div>
                        )}

                        {/* Tab bar */}
                        <div style={{
                            display: "flex",
                            borderBottom: "1px solid rgba(245,245,240,0.08)",
                            flexShrink: 0,
                            padding: "0 12px",
                        }}>
                            <TabButton
                                active={tab === "picker"}
                                onClick={() => setTab("picker")}
                                icon={<PlusCircle size={15} />}
                                label={tr("picker.tabNew")}
                            />
                            <TabButton
                                active={tab === "history"}
                                onClick={() => setTab("history")}
                                icon={<History size={15} />}
                                label={tr("picker.tabHistory")}
                            />
                        </div>

                        {/* Content */}
                        <div style={{
                            flex: 1,
                            overflowY: "auto",
                            overflowX: "hidden",
                            padding: "12px 16px 24px",
                            scrollbarWidth: "thin",
                            scrollbarColor: "var(--color-primary) transparent",
                        }}>
                            {tab === "picker" && (
                                $participant.role === "hider" ? (
                                    /* Hider: answer flow — reuse SessionQuestionPanel */
                                    <SessionQuestionPanel />
                                ) : (
                                    /* Seeker: category cards */
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        {visibleCategories.map((cat) => (
                                            <CategoryCard
                                                key={cat.type}
                                                cat={cat}
                                                descKey={`picker.questionDesc.${cat.type}` as any}
                                                onSelect={handleSelectType}
                                                tr={tr}
                                            />
                                        ))}
                                    </div>
                                )
                            )}
                            {tab === "history" && (
                                <QuestionList
                                    questions={$questions}
                                    isHider={false}
                                />
                            )}
                        </div>
                    </>
                )}
            </div>

            <OptionDrawers open={optionsOpen} onOpenChange={setOptionsOpen} showTrigger={false} />
        </>
    );
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({
    active,
    onClick,
    icon,
    label,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                background: "none",
                border: "none",
                borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
                cursor: "pointer",
                color: active ? "#fff" : "#99A1AF",
                fontSize: "13px",
                fontWeight: active ? 700 : 500,
                letterSpacing: "0.02em",
                marginBottom: "-1px",
                transition: "color 0.15s",
            }}
        >
            <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
            {label}
        </button>
    );
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
    cat,
    descKey,
    onSelect,
    tr,
}: {
    cat: CategoryDef;
    descKey: string;
    onSelect: (type: string) => void;
    tr: (key: any) => string;
}) {
    const [hovered, setHovered] = useState(false);
    const isDisabled = !!cat.disabled;

    const label = cat.type === "photo"
        ? tr("picker.photo")
        : tr(`questionType.${cat.type}` as any);
    const desc = tr(descKey as any);

    return (
        <button
            type="button"
            disabled={isDisabled}
            onClick={isDisabled ? undefined : () => onSelect(cat.type)}
            onMouseEnter={() => !isDisabled && setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 4,
                minHeight: 83,
                padding: "16px 20px",
                background: "#2A2A3A",
                borderRadius: 10,
                border: "none",
                borderLeft: `4px solid ${hovered && !isDisabled ? "var(--color-primary)" : "transparent"}`,
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.4 : 1,
                textAlign: "left",
                transition: "border-left-color 0.15s",
                width: "100%",
                boxSizing: "border-box",
            }}
        >
            <div style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: "16px",
                lineHeight: 1.2,
                fontFamily: "Poppins, sans-serif",
            }}>
                {label}
                {isDisabled && (
                    <span style={{ fontSize: "11px", fontWeight: 400, color: "#6B7280", marginLeft: 8 }}>
                        ({tr("picker.photoHint")})
                    </span>
                )}
            </div>
            <div style={{
                color: "#99A1AF",
                fontSize: "13px",
                lineHeight: 1.4,
            }}>
                {desc}
            </div>
        </button>
    );
}

