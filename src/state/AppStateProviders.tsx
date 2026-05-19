import { type ReactNode, useEffect, useRef } from "react";

import {
    appStateHidingZonesToImportState,
    appStatePlayAreaToImportState,
    appStateQuestionSettingsToImportState,
    createAppStateV1,
} from "@/state/appState";
import { HidingZoneProvider, useHidingZone } from "@/state/hidingZoneStore";
import { loadPersistedAppState, persistAppState } from "@/state/persistence";
import { PlayAreaProvider, usePlayArea } from "@/state/playAreaStore";
import { QuestionProvider, useQuestion } from "@/state/questionStore";

export function AppStateProviders({ children }: { children: ReactNode }) {
    return (
        <PlayAreaProvider>
            <HidingZoneProvider>
                <QuestionProvider>
                    <AppStatePersistenceCoordinator>
                        {children}
                    </AppStatePersistenceCoordinator>
                </QuestionProvider>
            </HidingZoneProvider>
        </PlayAreaProvider>
    );
}

function AppStatePersistenceCoordinator({ children }: { children: ReactNode }) {
    const playAreaStore = usePlayArea();
    const hidingZoneStore = useHidingZone();
    const questionStore = useQuestion();
    const isRestored =
        playAreaStore.isRestored &&
        hidingZoneStore.isRestored &&
        questionStore.isRestored;
    const createdAtRef = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const persisted = await loadPersistedAppState();
            if (cancelled) return;

            if (persisted) {
                createdAtRef.current = persisted.metadata.createdAt;
                playAreaStore.importPlayArea(
                    appStatePlayAreaToImportState(persisted.playArea),
                );
                hidingZoneStore.replaceSetup(
                    appStateHidingZonesToImportState(persisted.hidingZones),
                );
                questionStore.importQuestions(persisted.questions);
                questionStore.importQuestionSettings(
                    appStateQuestionSettingsToImportState(
                        persisted.questionSettings,
                    ),
                );
            }

            playAreaStore.markRestored();
            hidingZoneStore.markRestored();
            questionStore.markRestored();
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isRestored) return;

        const now = new Date();
        const createdAt = createdAtRef.current ?? now.toISOString();
        createdAtRef.current = createdAt;

        persistAppState(
            createAppStateV1({
                hidingZones: {
                    radiusMeters: hidingZoneStore.radiusMeters,
                    radiusUnit: hidingZoneStore.radiusUnit,
                    selectedPresetIds: hidingZoneStore.selectedPresetIds,
                },
                metadata: {
                    createdAt,
                    updatedAt: now.toISOString(),
                },
                playArea: playAreaStore.playArea,
                questionSettings: {
                    isPinLocked: questionStore.isPinLocked,
                },
                questions: questionStore.questions,
            }),
        );
    }, [
        hidingZoneStore.radiusMeters,
        hidingZoneStore.radiusUnit,
        hidingZoneStore.selectedPresetIds,
        isRestored,
        playAreaStore.playArea,
        questionStore.isPinLocked,
        questionStore.questions,
    ]);

    return children;
}
