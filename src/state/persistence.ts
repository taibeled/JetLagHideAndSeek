import AsyncStorage from "@react-native-async-storage/async-storage";

import { type AppStateV1, migratePersistedAppState } from "@/state/appState";

const APP_STATE_KEY = "app-state:v1";

async function readJson(): Promise<unknown | null> {
    try {
        const raw = await AsyncStorage.getItem(APP_STATE_KEY);
        if (raw === null || raw === undefined) return null;
        return JSON.parse(raw) as unknown;
    } catch {
        await AsyncStorage.removeItem(APP_STATE_KEY);
        return null;
    }
}

export async function loadPersistedAppState(): Promise<AppStateV1 | null> {
    const raw = await readJson();
    if (raw === null) return null;

    const migrated = migratePersistedAppState(raw);
    if (migrated) return migrated;

    await AsyncStorage.removeItem(APP_STATE_KEY);
    return null;
}

export async function persistAppState(state: AppStateV1): Promise<void> {
    try {
        await AsyncStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
    } catch {
        // Storage full or unavailable - silently ignore.
    }
}

export async function clearPersistedAppState(): Promise<void> {
    try {
        await AsyncStorage.removeItem(APP_STATE_KEY);
    } catch {
        // Ignore cleanup errors.
    }
}
