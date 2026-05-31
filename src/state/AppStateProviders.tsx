import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
} from "react";

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
import { warmBoundaryCacheFromStorage } from "@/features/map/playAreaBoundary";
import { loadPersistedAppState, persistAppState } from "@/state/persistence";
import { PlayAreaProvider, usePlayArea } from "@/state/playAreaStore";
import {
    QuestionProvider,
    useQuestionActions,
    useQuestionState,
} from "@/state/questionStore";

// ---------------------------------------------------------------------------
// Restoration context — consumed by the root layout to gate the splash screen
// ---------------------------------------------------------------------------

const AppRestorationContext = createContext<boolean>(false);

/**
 * Returns `true` once all provider slices have been restored from persisted
 * state (or defaulted). The root layout uses this to hold the splash screen
 * until the first meaningful frame is ready.
 */
export function useAppIsRestored(): boolean {
    return useContext(AppRestorationContext);
}

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
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const debouncedPersist = useCallback(
        (state: ReturnType<typeof createAppStateV1>) => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
            debounceRef.current = setTimeout(() => {
                persistAppState(state);
            }, 500);
        },
        [],
    );

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

            // Warm the boundary cache in the background — non-blocking.
            warmBoundaryCacheFromStorage();
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!isRestored) return;

        const now = new Date();
        const createdAt = createdAtRef.current ?? now.toISOString();
        createdAtRef.current = createdAt;

        debouncedPersist(
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
                    activeQuestionId: questionState.activeQuestionId,
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

    return (
        <AppRestorationContext.Provider value={isRestored}>
            {children}
        </AppRestorationContext.Provider>
    );
}
