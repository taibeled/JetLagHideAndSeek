import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    loadCachedPlayAreaByRelationId,
    persistPlayAreaBoundary,
} from "@/features/map/playAreaBoundary";
import { type AppStateV1, migratePersistedAppState } from "@/state/appState";

const LEGACY_APP_STATE_KEY = "app-state:v1";
const APP_STATE_METADATA_KEY = "app-state:metadata:v1";
const APP_STATE_PLAY_AREA_KEY = "app-state:play-area:v1";
const APP_STATE_HIDING_ZONES_KEY = "app-state:hiding-zones:v1";
const APP_STATE_QUESTION_SETTINGS_KEY = "app-state:question-settings:v1";
const APP_STATE_QUESTIONS_KEY = "app-state:questions:v1";
const APP_STATE_SLICE_KEYS = [
    APP_STATE_METADATA_KEY,
    APP_STATE_PLAY_AREA_KEY,
    APP_STATE_HIDING_ZONES_KEY,
    APP_STATE_QUESTION_SETTINGS_KEY,
    APP_STATE_QUESTIONS_KEY,
] as const;

export async function loadPersistedAppState(): Promise<AppStateV1 | null> {
    const splitState = await loadSplitPersistedAppState();
    if (splitState) return splitState;

    const raw = await readJson(LEGACY_APP_STATE_KEY);
    if (raw === null) return null;

    const migrated = migratePersistedAppState(raw);
    if (migrated) return migrated;

    await removeItem(LEGACY_APP_STATE_KEY);
    return null;
}

export async function persistAppState(state: AppStateV1): Promise<void> {
    try {
        await persistPlayAreaBoundary(state.playArea);

        await AsyncStorage.multiSet(serializeSlices(state));
        await AsyncStorage.removeItem(LEGACY_APP_STATE_KEY);
    } catch {
        // Storage full or unavailable - silently ignore.
    }
}

export async function clearPersistedAppState(): Promise<void> {
    try {
        await AsyncStorage.multiRemove([
            LEGACY_APP_STATE_KEY,
            ...APP_STATE_SLICE_KEYS,
        ]);
    } catch {
        // Ignore cleanup errors.
    }
}

async function loadSplitPersistedAppState(): Promise<AppStateV1 | null> {
    let entries: readonly (readonly [string, string | null])[];
    try {
        entries = await AsyncStorage.multiGet([...APP_STATE_SLICE_KEYS]);
    } catch {
        return null;
    }

    if (entries.every(([, value]) => value === null)) return null;
    if (entries.some(([, value]) => value === null)) {
        await clearSplitPersistedAppState();
        return null;
    }

    try {
        const rawSlices = Object.fromEntries(entries) as Record<string, string>;
        const playAreaReference = JSON.parse(
            rawSlices[APP_STATE_PLAY_AREA_KEY],
        ) as unknown;
        if (!isPlayAreaReference(playAreaReference)) {
            await clearSplitPersistedAppState();
            return null;
        }

        const cached = await loadCachedPlayAreaByRelationId(
            playAreaReference.osmId,
        );
        if (!cached) {
            await clearSplitPersistedAppState();
            return null;
        }

        const migrated = migratePersistedAppState({
            hidingZones: JSON.parse(rawSlices[APP_STATE_HIDING_ZONES_KEY]),
            metadata: JSON.parse(rawSlices[APP_STATE_METADATA_KEY]),
            playArea: cached.playArea,
            questionSettings: JSON.parse(
                rawSlices[APP_STATE_QUESTION_SETTINGS_KEY],
            ),
            questions: JSON.parse(rawSlices[APP_STATE_QUESTIONS_KEY]),
            version: 1,
        });
        if (!migrated) {
            await clearSplitPersistedAppState();
            return null;
        }

        return migrated;
    } catch {
        await clearSplitPersistedAppState();
        return null;
    }
}

function serializeSlices(state: AppStateV1): [string, string][] {
    return [
        [APP_STATE_METADATA_KEY, JSON.stringify(state.metadata)],
        [
            APP_STATE_PLAY_AREA_KEY,
            JSON.stringify({ osmId: state.playArea.osmId }),
        ],
        [APP_STATE_HIDING_ZONES_KEY, JSON.stringify(state.hidingZones)],
        [
            APP_STATE_QUESTION_SETTINGS_KEY,
            JSON.stringify(state.questionSettings),
        ],
        [APP_STATE_QUESTIONS_KEY, JSON.stringify(state.questions)],
    ];
}

function isPlayAreaReference(value: unknown): value is { osmId: number } {
    return (
        typeof value === "object" &&
        value !== null &&
        "osmId" in value &&
        typeof value.osmId === "number" &&
        Number.isSafeInteger(value.osmId) &&
        value.osmId > 0
    );
}

async function readJson(key: string): Promise<unknown | null> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (raw === null || raw === undefined) return null;
        return JSON.parse(raw) as unknown;
    } catch {
        await removeItem(key);
        return null;
    }
}

async function clearSplitPersistedAppState() {
    try {
        await AsyncStorage.multiRemove([...APP_STATE_SLICE_KEYS]);
    } catch {
        // Ignore cleanup errors.
    }
}

async function removeItem(key: string) {
    try {
        await AsyncStorage.removeItem(key);
    } catch {
        // Ignore cleanup errors.
    }
}
