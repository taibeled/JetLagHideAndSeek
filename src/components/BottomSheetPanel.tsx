/**
 * BottomSheetPanel — renders the bottom sheet with session questions.
 *
 * Onboarding flow (role selection, area search) is now handled by
 * CreateSessionOverlay. This component only shows the SessionManager once
 * the user is in an active session.
 */
import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { useT } from "@/i18n";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { OptionDrawers } from "@/components/OptionDrawers";
import { sessionCode, sessionParticipant } from "@/lib/session-context";
import { bottomSheetState, pickerOpen } from "@/lib/bottom-sheet-state";
import { useSessionMapSync } from "@/hooks/useSessionMapSync";
import { useMapLocationSync } from "@/hooks/useMapLocationSync";
import { useSessionWebSocket } from "@/hooks/useSessionWebSocket";

import { SessionManager } from "./session/SessionManager";
import { QuestionPickerSheet } from "./session/QuestionPickerSheet";

export const BottomSheetPanel = () => {
    const [optionsOpen, setOptionsOpen] = useState(false);

    const tr = useT();

    useSessionMapSync();
    useMapLocationSync();

    const $participant = useStore(sessionParticipant);
    const $code = useStore(sessionCode);

    // WS hook lives here (always mounted) so the connection survives sheet collapse.
    // Both hiders and seekers need a live WS connection while in a session.
    useSessionWebSocket(
        $participant && $code
            ? { code: $code, token: $participant.token }
            : { code: "", token: "" },
    );

    const inSession = $participant !== null;

    // Collapse sheet for both roles when in an active session —
    // session content is handled by QuestionPickerSheet (opened via FRAGEN button).
    useEffect(() => {
        if (inSession) bottomSheetState.set("collapsed");
    }, [inSession]);

    return (
        <>
            <BottomSheet
                title={tr("sidebar.questions")}
                onSettingsClick={() => setOptionsOpen(true)}
                onTitleClick={inSession ? () => pickerOpen.set(true) : undefined}
            >
                <div className="px-3 py-2">
                    {$participant ? <SessionManager /> : null}
                </div>
            </BottomSheet>
            <QuestionPickerSheet />
            <OptionDrawers open={optionsOpen} onOpenChange={setOptionsOpen} showTrigger={false} />
        </>
    );
};
