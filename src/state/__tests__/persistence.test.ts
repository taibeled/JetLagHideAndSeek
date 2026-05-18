import AsyncStorage from "@react-native-async-storage/async-storage";

import { defaultPlayArea } from "@/features/map/playArea";
import {
    appStateV1Schema,
    createAppStateV1,
    migratePersistedAppState,
} from "@/state/appState";
import {
    clearPersistedAppState,
    loadPersistedAppState,
    persistAppState,
} from "@/state/persistence";

function makeAppState() {
    return createAppStateV1({
        hidingZones: {
            radiusMeters: 900,
            radiusUnit: "m",
            selectedPresetIds: ["tokyo-metro", "toei"],
        },
        now: new Date("2026-05-18T00:00:00.000Z"),
        playArea: defaultPlayArea,
    });
}

function makeLegacyAppStateWithoutQuestions() {
    const state = makeAppState();
    return {
        hidingZones: state.hidingZones,
        metadata: state.metadata,
        playArea: state.playArea,
        version: state.version,
    };
}

function makeRadiusQuestion() {
    return {
        center: defaultPlayArea.center,
        createdAt: "2026-05-18T00:00:00.000Z",
        id: "q-1",
        radiusMeters: 500,
        radiusOption: "500m" as const,
        radiusUnit: "m" as const,
        type: "radius" as const,
        updatedAt: "2026-05-18T00:00:00.000Z",
    };
}

describe("AppStateV1 schema", () => {
    it("parses a valid full app state", () => {
        const state = makeAppState();
        const result = appStateV1Schema.safeParse(state);

        expect(result.success).toBe(true);
        expect(state.questions).toEqual([]);
    });

    it("rejects an unknown version through the migration placeholder", () => {
        expect(
            migratePersistedAppState({
                ...makeAppState(),
                version: 2,
            }),
        ).toBeNull();
    });

    it("rejects an invalid play-area shape", () => {
        expect(
            migratePersistedAppState({
                ...makeAppState(),
                playArea: {
                    ...makeAppState().playArea,
                    boundary: undefined,
                },
            }),
        ).toBeNull();
    });

    it("accepts radius questions", () => {
        const state = { ...makeAppState(), questions: [makeRadiusQuestion()] };
        expect(migratePersistedAppState(state)).toEqual(state);
    });

    it("rejects invalid question shapes", () => {
        expect(
            migratePersistedAppState({
                ...makeAppState(),
                questions: [{ ...makeRadiusQuestion(), radiusMeters: -1 }],
            }),
        ).toBeNull();
    });

    it("migrates existing v1 app state without questions to an empty slice", () => {
        expect(
            migratePersistedAppState(makeLegacyAppStateWithoutQuestions()),
        ).toEqual(makeAppState());
    });

    it("rejects an invalid hiding-zone shape", () => {
        expect(
            migratePersistedAppState({
                ...makeAppState(),
                hidingZones: {
                    radiusMeters: -1,
                    radiusUnit: "m",
                    selectedPresetIds: [],
                },
            }),
        ).toBeNull();
    });
});

describe("app-state persistence", () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    it("returns null when nothing is persisted", async () => {
        const result = await loadPersistedAppState();
        expect(result).toBeNull();
    });

    it("round-trips a full persisted app state", async () => {
        const state = makeAppState();

        await persistAppState(state);

        await expect(loadPersistedAppState()).resolves.toEqual(state);
    });

    it("loads existing v1 state without questions as an empty slice", async () => {
        await AsyncStorage.setItem(
            "app-state:v1",
            JSON.stringify(makeLegacyAppStateWithoutQuestions()),
        );

        await expect(loadPersistedAppState()).resolves.toEqual(makeAppState());
    });

    it("returns null and cleans up corrupted JSON", async () => {
        await AsyncStorage.setItem("app-state:v1", "not json");

        await expect(loadPersistedAppState()).resolves.toBeNull();
        await expect(AsyncStorage.getItem("app-state:v1")).resolves.toBeNull();
    });

    it("returns null and cleans up an invalid app state", async () => {
        await AsyncStorage.setItem(
            "app-state:v1",
            JSON.stringify({ ...makeAppState(), version: 99 }),
        );

        await expect(loadPersistedAppState()).resolves.toBeNull();
        await expect(AsyncStorage.getItem("app-state:v1")).resolves.toBeNull();
    });

    it("removes the persisted app-state key", async () => {
        await persistAppState(makeAppState());

        await clearPersistedAppState();

        await expect(loadPersistedAppState()).resolves.toBeNull();
    });
});
