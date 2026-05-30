import { type ReactNode, useEffect, useRef } from "react";

import {
    appStateHidingZonesToImportState,
    appStatePlayAreaToImportState,
    appStateQuestionSettingsToImportState,
    createAppStateV1,
} from "@/state/appState";
import {
    HidingZoneProvider,
    useHidingZoneActions,
    useHidingZoneState,
} from "@/state/hidingZoneStore";
import { loadPersistedAppState, persistAppState } from "@/state/persistence";
import { PlayAreaProvider, usePlayArea } from "@/state/playAreaStore";
import {
    QuestionProvider,
    useQuestionActions,
    useQuestionState,
} from "@/state/questionStore";

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
    const hidingZoneState = useHidingZoneState();
    const hidingZoneActions = useHidingZoneActions();
    const questionState = useQuestionState();
    const questionActions = useQuestionActions();
    const isRestored =
        playAreaStore.isRestored &&
        hidingZoneState.isRestored &&
        questionState.isRestored;
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
                hidingZoneActions.replaceSetup(
                    appStateHidingZonesToImportState(persisted.hidingZones),
                );
                questionActions.importQuestions(persisted.questions);
                questionActions.importQuestionSettings(
                    appStateQuestionSettingsToImportState(
                        persisted.questionSettings,
                    ),
                );
            }

            playAreaStore.markRestored();
            hidingZoneActions.markRestored();
            questionActions.markRestored();
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
                    radiusMeters: hidingZoneState.radiusMeters,
                    radiusUnit: hidingZoneState.radiusUnit,
                    selectedPresetIds: hidingZoneState.selectedPresetIds,
                },
                metadata: {
                    createdAt,
                    updatedAt: now.toISOString(),
                },
                playArea: playAreaStore.playArea,
                questionSettings: {
                    isPinLocked: questionState.isPinLocked,
                },
                questions: questionState.questions,
            }),
        );
    }, [
        hidingZoneState.radiusMeters,
        hidingZoneState.radiusUnit,
        hidingZoneState.selectedPresetIds,
        isRestored,
        playAreaStore.playArea,
        questionState.isPinLocked,
        questionState.questions,
    ]);

    return children;
}
