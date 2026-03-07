/**
 * Re-fetches the session's map location from the backend on page reload.
 *
 * When the page reloads with an active session (sessionParticipant persisted
 * in localStorage), the map location might be stale or missing from the
 * in-memory atoms.  The WebSocket sync event also delivers the map location,
 * but there's a delay until the WS connects.  This hook fires a lightweight
 * REST call immediately on mount to apply the correct map area.
 *
 * Mount once inside BottomSheetPanel (always rendered).
 */
import { useStore } from "@nanostores/react";
import { useEffect, useRef } from "react";

import { getSession } from "@/lib/session-api";
import {
    applyServerMapLocation,
    sessionCode,
    sessionParticipant,
} from "@/lib/session-context";

export function useSessionInit() {
    const participant = useStore(sessionParticipant);
    const code = useStore(sessionCode);
    const didInit = useRef(false);

    useEffect(() => {
        // Only run once per mount cycle when resuming an existing session
        if (!participant || !code || didInit.current) return;
        didInit.current = true;

        (async () => {
            try {
                const data = await getSession(code);
                if (data.session.mapLocation) {
                    applyServerMapLocation(data.session.mapLocation);
                }
            } catch {
                // Non-critical: the WS sync will deliver the data shortly.
            }
        })();
    }, [participant, code]);
}
