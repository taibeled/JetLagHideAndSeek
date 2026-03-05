/**
 * PhotoConfig — Photo challenge picker sub-view.
 *
 * Displays a scrollable list of photo challenges filtered by the current
 * game size. The seeker selects one and sends it directly to the hider.
 *
 * Unlike radius/thermometer/tentacles, photo questions require no map
 * interaction or configuration — just pick a challenge and send.
 */
import { useStore } from "@nanostores/react";
import { Camera } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";

import { useT, type TranslationKey } from "@/i18n";
import { bottomSheetState, pickerOpen } from "@/lib/bottom-sheet-state";
import { PHOTO_CHALLENGES, type PhotoChallenge } from "@/lib/photo-challenges";
import { addQuestion } from "@/lib/session-api";
import { gameSize, sessionCode, sessionParticipant } from "@/lib/session-context";
import { PickerFooter } from "./PickerFooter";
import { PickerHeader, type WsStatus } from "./PickerHeader";

export interface PhotoConfigProps {
    wsStatus: WsStatus;
    onBack: () => void;
    onSettings: () => void;
    onClose: () => void;
    onDone?: () => void;
}

export function PhotoConfig({
    wsStatus,
    onBack,
    onSettings,
    onClose,
    onDone,
}: PhotoConfigProps) {
    const tr = useT();
    const $gameSize = useStore(gameSize);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Filter challenges by current game size
    const visibleChallenges = PHOTO_CHALLENGES.filter(
        (c) => $gameSize === null || c.sizes.includes($gameSize),
    );

    async function handleSend() {
        if (!selectedId) return;
        const code = sessionCode.get();
        const participant = sessionParticipant.get();
        if (!code || !participant) return;

        setSubmitting(true);
        try {
            await addQuestion(code, participant.token, {
                type: "photo",
                data: { photoType: selectedId },
            });
            toast.success(tr("sqp.questionSent" as TranslationKey));
            setSubmitting(false);
            onDone?.();
            pickerOpen.set(false);
            bottomSheetState.set("collapsed");
        } catch {
            toast.error(
                "Server derzeit nicht erreichbar. Bitte probiere die Frage gleich nochmal zu senden.",
            );
            setSubmitting(false);
        }
    }

    return (
        <>
            <PickerHeader
                title={`${tr("questionType.photo" as TranslationKey)} 📸`}
                wsStatus={wsStatus}
                onBack={onBack}
                onSettings={onSettings}
                onClose={onClose}
            />

            {/* Scrollable challenge list */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "12px 16px 8px",
                    scrollbarWidth: "thin",
                    scrollbarColor: "var(--color-primary) transparent",
                }}
            >
                {/* Size indicator */}
                {$gameSize && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 10,
                            color: "#6B7280",
                            fontSize: "12px",
                        }}
                    >
                        <Camera size={13} />
                        <span>
                            {visibleChallenges.length}{" "}
                            {visibleChallenges.length === 1
                                ? "Aufgabe"
                                : "Aufgaben"}{" "}
                            für Größe {$gameSize}
                        </span>
                    </div>
                )}

                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                    }}
                >
                    {visibleChallenges.map((challenge) => (
                        <PhotoChallengeCard
                            key={challenge.id}
                            challenge={challenge}
                            selected={selectedId === challenge.id}
                            onSelect={() =>
                                setSelectedId(
                                    selectedId === challenge.id
                                        ? null
                                        : challenge.id,
                                )
                            }
                            tr={tr}
                        />
                    ))}
                </div>
            </div>

            <PickerFooter
                primaryLabel={
                    submitting
                        ? (tr("sqp.sending" as TranslationKey))
                        : `📸 ${tr("sqp.sendQuestion" as TranslationKey)}`
                }
                primaryDisabled={!selectedId || submitting}
                onPrimary={handleSend}
                onCancel={onBack}
                cancelDisabled={submitting}
            />
        </>
    );
}

// ── Photo challenge card ─────────────────────────────────────────────────────

function PhotoChallengeCard({
    challenge,
    selected,
    onSelect,
    tr,
}: {
    challenge: PhotoChallenge;
    selected: boolean;
    onSelect: () => void;
    tr: (key: any) => string;
}) {
    const title = tr(`photoType.${challenge.id}` as TranslationKey);
    const rules = tr(`photoRules.${challenge.id}` as TranslationKey);

    return (
        <button
            type="button"
            onClick={onSelect}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "14px 16px",
                background: selected ? "rgba(232,50,58,0.12)" : "#2A2A3A",
                borderRadius: 10,
                border: selected
                    ? "2px solid var(--color-primary)"
                    : "2px solid transparent",
                borderLeft: selected
                    ? "4px solid var(--color-primary)"
                    : "4px solid transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
                width: "100%",
                boxSizing: "border-box",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <span style={{ fontSize: "16px" }}>📸</span>
                <span
                    style={{
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "14px",
                        lineHeight: 1.3,
                        fontFamily: "Poppins, sans-serif",
                    }}
                >
                    {title}
                </span>
                {/* Size badges */}
                <div
                    style={{
                        marginLeft: "auto",
                        display: "flex",
                        gap: 3,
                    }}
                >
                    {challenge.sizes.map((s) => (
                        <span
                            key={s}
                            style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                color: "#6B7280",
                                background: "rgba(245,245,240,0.06)",
                                borderRadius: 4,
                                padding: "1px 5px",
                                letterSpacing: "0.05em",
                            }}
                        >
                            {s}
                        </span>
                    ))}
                </div>
            </div>
            <p
                style={{
                    color: "#99A1AF",
                    fontSize: "12px",
                    lineHeight: 1.4,
                    margin: 0,
                    paddingLeft: 24,
                }}
            >
                {rules}
            </p>
        </button>
    );
}
