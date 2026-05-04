import { persistentAtom } from "@nanostores/persistent";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map } from "leaflet";
import { atom, computed, onSet } from "nanostores";

import type {
    AdditionalMapGeoLocations,
    CustomStation,
    OpenStreetMap,
    StationCircle,
} from "@/maps/api";
import { extractStationLabel } from "@/maps/geo-utils";
import {
    type DeepPartial,
    type Question,
    type Questions,
    questionSchema,
    questionsSchema,
    type Units,
} from "@/maps/schema";

import {
    detectPlayAreaMode,
    normalizePlayAreaGeometry,
} from "./playAreaMode";
import { PLAY_AREA_MODES,type PlayAreaModeId } from "./playAreaModes";

function persistentJsonAtom<T>(key: string, initial: T) {
    return persistentAtom<T>(key, initial, {
        encode: JSON.stringify,
        decode: JSON.parse,
    });
}

export const mapGeoLocation = persistentJsonAtom<OpenStreetMap>(
    "mapGeoLocation",
    {
        geometry: {
            coordinates: [36.5748441, 139.2394179],
            type: "Point",
        },
        type: "Feature",
        properties: {
            osm_type: "R",
            osm_id: 382313,
            extent: [45.7112046, 122.7141754, 20.2145811, 154.205541],
            country: "Japan",
            osm_key: "place",
            countrycode: "JP",
            osm_value: "country",
            name: "Japan",
            type: "country",
        },
    },
);

export const additionalMapGeoLocations = persistentJsonAtom<
    AdditionalMapGeoLocations[]
>("additionalMapGeoLocations", []);
export const permanentOverlay = persistentJsonAtom<FeatureCollection | null>(
    "permanentOverlay",
    null,
);

export const mapGeoJSON = atom<FeatureCollection<
    Polygon | MultiPolygon
> | null>(null);
export const polyGeoJSON = persistentJsonAtom<FeatureCollection<
    Polygon | MultiPolygon
> | null>("polyGeoJSON", null);

export const playAreaMode = atom<PlayAreaModeId>("default");

let playAreaModeRecomputeGeneration = 0;

const updatePlayAreaMode = async (
    resolver: () => Promise<PlayAreaModeId>,
) => {
    const generation = ++playAreaModeRecomputeGeneration;
    try {
        const mode = await resolver();
        if (generation === playAreaModeRecomputeGeneration) {
            playAreaMode.set(mode);
        }
    } catch (e) {
        console.error("Failed to recompute play area mode", e);
        if (generation === playAreaModeRecomputeGeneration) {
            playAreaMode.set("default");
        }
    }
};

export const refreshPlayAreaModeFromGeometry = async (
    playArea: unknown,
) => {
    if (typeof window === "undefined") return;
    const normalized = normalizePlayAreaGeometry(playArea);
    if (!normalized) return;

    await updatePlayAreaMode(() => detectPlayAreaMode(normalized));
};

const isOpenStreetMapLocation = (value: unknown): value is OpenStreetMap => {
    if (!value || typeof value !== "object") return false;
    const geometry = (value as { geometry?: unknown }).geometry;
    if (
        !geometry ||
        typeof geometry !== "object" ||
        (geometry as { type?: unknown }).type !== "Point"
    ) {
        return false;
    }
    const properties = (value as { properties?: unknown }).properties;
    if (!properties || typeof properties !== "object") return false;
    const osmId = (properties as { osm_id?: unknown }).osm_id;
    const osmType = (properties as { osm_type?: unknown }).osm_type;
    return typeof osmId === "number" && typeof osmType === "string";
};

export const refreshPlayAreaModeFromCurrentLocations = async () => {
    if (typeof window === "undefined") return;
    if (polyGeoJSON.get() !== null) return;

    const currentLocation = mapGeoLocation.get();
    if (!isOpenStreetMapLocation(currentLocation)) return;

    await updatePlayAreaMode(async () => {
        const { determineMapBoundaries } = await import("@/maps/api");
        const boundaries = await determineMapBoundaries();
        return detectPlayAreaMode(boundaries);
    });
};

[
    mapGeoLocation,
    additionalMapGeoLocations,
].forEach((s) => {
    onSet(s, () => {
        refreshPlayAreaModeFromCurrentLocations();
    });
});

// Initial computation
if (typeof window !== "undefined") {
    setTimeout(() => {
        const poly = polyGeoJSON.get();
        if (poly !== null) {
            void refreshPlayAreaModeFromGeometry(poly);
        } else {
            void refreshPlayAreaModeFromCurrentLocations();
        }
    }, 0);
}

const QUESTIONS_STORAGE_KEY = "questions";
const QUESTIONS_STORAGE_BACKUP_KEY = "questions_backup";

const sanitizeQuestions = (input: unknown): Questions => {
    if (!Array.isArray(input)) return [];
    return input.flatMap((question) => {
        const parsed = questionSchema.safeParse(question);
        return parsed.success ? [parsed.data] : [];
    });
};

const recoverTruncatedQuestions = (value: string): Questions | null => {
    if (!value.trimStart().startsWith("[")) return null;

    for (let idx = value.length - 1; idx >= 0; idx -= 1) {
        if (value[idx] !== "}") continue;

        let candidate = value.slice(0, idx + 1).trimEnd();
        if (candidate.endsWith(",")) {
            candidate = candidate.slice(0, -1);
        }
        candidate = `${candidate}]`;

        try {
            const parsed = JSON.parse(candidate);
            return sanitizeQuestions(parsed);
        } catch {
            // Continue trying shorter prefixes.
        }
    }

    return null;
};

const parseQuestionsString = (value: string): Questions | null => {
    try {
        return questionsSchema.parse(JSON.parse(value));
    } catch {
        try {
            return sanitizeQuestions(JSON.parse(value));
        } catch {
            return recoverTruncatedQuestions(value);
        }
    }
};

const loadPersistedQuestions = (): Questions => {
    if (typeof localStorage === "undefined") return [];
    const primary = localStorage.getItem(QUESTIONS_STORAGE_KEY);
    const backup = localStorage.getItem(QUESTIONS_STORAGE_BACKUP_KEY);

    if (primary) {
        const parsed = parseQuestionsString(primary);
        if (parsed !== null) return parsed;
    }
    if (backup) {
        const parsed = parseQuestionsString(backup);
        if (parsed !== null) {
            localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(parsed));
            return parsed;
        }
    }
    return [];
};

const persistQuestions = (nextQuestions: Questions) => {
    if (typeof localStorage === "undefined") return;
    try {
        const current = localStorage.getItem(QUESTIONS_STORAGE_KEY);
        if (current !== null) {
            localStorage.setItem(QUESTIONS_STORAGE_BACKUP_KEY, current);
        }
        localStorage.setItem(
            QUESTIONS_STORAGE_KEY,
            JSON.stringify(nextQuestions),
        );
    } catch (e) {
        // Keep the last known persisted snapshot if local storage quota is exceeded.
        console.warn("Failed to persist questions", e);
    }
};

export const questions = atom<Questions>(loadPersistedQuestions());
onSet(questions, ({ newValue }) => {
    persistQuestions(newValue);
});
export const addQuestion = (question: DeepPartial<Question>) =>
    questionModified(questions.get().push(questionSchema.parse(question)));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const questionModified = (..._: any[]) => {
    if (autoSave.get()) {
        questions.set([...questions.get()]);
    } else {
        triggerLocalRefresh.set(Math.random());
    }
};

export const leafletMapContext = atom<Map | null>(null);

export const defaultUnit = persistentAtom<Units>("defaultUnit", "miles");
export const hiderMode = persistentJsonAtom<
    | false
    | {
          latitude: number;
          longitude: number;
      }
>("isHiderMode", false);
export const triggerLocalRefresh = atom<number>(0);
export const displayHidingZones = persistentJsonAtom<boolean>(
    "displayHidingZones",
    false,
);
export const displayHidingZonesOptions = persistentJsonAtom<string[]>(
    "displayHidingZonesOptions",
    ["[railway=station]"],
);
export const displayHidingZoneOperators = persistentJsonAtom<string[]>(
    "displayHidingZoneOperators",
    [],
);
export const displayHidingZonesStyle = persistentAtom<
    "zones" | "stations" | "no-overlap" | "no-display"
>("displayHidingZonesStyle", "zones");
export const questionFinishedMapData = atom<any>(null);

export const trainStations = atom<StationCircle[]>([]);
onSet(trainStations, ({ newValue }) => {
    const mode = playAreaMode.get();
    const strategy = PLAY_AREA_MODES[mode].stationNameStrategy;
    newValue.sort((a, b) => {
        const aName = (extractStationLabel(a.properties, strategy) || "") as string;
        const bName = (extractStationLabel(b.properties, strategy) || "") as string;
        return aName.localeCompare(bName);
    });
});

export const useCustomStations = persistentJsonAtom<boolean>(
    "useCustomStations",
    false,
);
export const customStations = persistentJsonAtom<CustomStation[]>(
    "customStations",
    [],
);
export const mergeDuplicates = persistentJsonAtom<boolean>(
    "removeDuplicates",
    false,
);
export const includeDefaultStations = persistentJsonAtom<boolean>(
    "includeDefaultStations",
    false,
);
export const animateMapMovements = persistentJsonAtom<boolean>(
    "animateMapMovements",
    false,
);
export const hidingRadius = persistentJsonAtom<number>("hidingRadius", 0.5);
export const hidingRadiusUnits = persistentJsonAtom<Units>(
    "hidingRadiusUnits",
    "miles",
);
export const disabledStations = persistentJsonAtom<string[]>(
    "disabledStations",
    [],
);
export const autoSave = persistentJsonAtom<boolean>("autoSave", true);
export const save = () => {
    questions.set([...questions.get()]);
    const $hiderMode = hiderMode.get();

    if ($hiderMode !== false) {
        hiderMode.set({ ...$hiderMode });
    }
};

/* Presets for custom questions (savable / sharable / editable) */
export type CustomPreset = {
    id: string;
    name: string;
    type: string;
    data: any;
    createdAt: string;
};

export const customPresets = persistentJsonAtom<CustomPreset[]>(
    "customPresets",
    [],
);
onSet(customPresets, ({ newValue }) => {
    newValue.sort((a, b) => a.name.localeCompare(b.name));
});

export const saveCustomPreset = (
    preset: Omit<CustomPreset, "id" | "createdAt">,
) => {
    const id =
        typeof crypto !== "undefined" &&
        typeof (crypto as any).randomUUID === "function"
            ? (crypto as any).randomUUID()
            : String(Date.now());
    const p: CustomPreset = {
        ...preset,
        id,
        createdAt: new Date().toISOString(),
    };
    customPresets.set([...customPresets.get(), p]);
    return p;
};

export const updateCustomPreset = (
    id: string,
    updates: Partial<CustomPreset>,
) => {
    customPresets.set(
        customPresets
            .get()
            .map((p) => (p.id === id ? { ...p, ...updates } : p)),
    );
};

export const deleteCustomPreset = (id: string) => {
    customPresets.set(customPresets.get().filter((p) => p.id !== id));
};

export type TeamPayload = { id: string; name: string };

export const team = persistentJsonAtom<TeamPayload | null>("team", null);

export const casServerUrl = persistentAtom<string>("casServerUrl", "", {
    encode: (value: string) => value,
    decode: (value: string) => value,
});

export const casServerStatus = atom<
    "unknown" | "available" | "unavailable"
>("unknown");

export const casServerEffectiveUrl = atom<string | null>(null);

export const liveSyncEnabled = persistentJsonAtom<boolean>(
    "liveSyncEnabled",
    true,
);

export const currentSid = atom<string | null>(null);

export const teamHistory = atom<{ sid: string; ts: number }[]>([]);

export const hidingZone = computed(
    [
        questions,
        polyGeoJSON,
        mapGeoLocation,
        additionalMapGeoLocations,
        disabledStations,
        hidingRadius,
        hidingRadiusUnits,
        displayHidingZones,
        displayHidingZonesOptions,
        displayHidingZoneOperators,
        useCustomStations,
        customStations,
        includeDefaultStations,
        customPresets,
        permanentOverlay,
        team,
        defaultUnit,
        displayHidingZonesStyle,
    ],
    (
        q,
        geo,
        loc,
        altLoc,
        disabledStations,
        radius,
        hidingRadiusUnits,
        showHidingZones,
        zoneOptions,
        zoneOperators,
        useCustom,
        $customStations,
        includeDefault,
        presets,
        $permanentOverlay,
        $team,
        unit,
        zonesStyle,
    ) => {
        const withTeam = <T extends Record<string, unknown>>(base: T) =>
            $team ? { ...base, team: $team } : base;

        if (geo !== null) {
            return withTeam({
                ...geo,
                questions: q,
                disabledStations: disabledStations,
                hidingRadius: radius,
                hidingRadiusUnits,
                displayHidingZones: showHidingZones,
                zoneOptions: zoneOptions,
                zoneOperators: zoneOperators,
                useCustomStations: useCustom,
                customStations: $customStations,
                includeDefaultStations: includeDefault,
                presets: structuredClone(presets),
                permanentOverlay: $permanentOverlay,
                defaultUnit: unit,
                displayHidingZonesStyle: zonesStyle,
            });
        }
        const $loc = structuredClone(loc);
        $loc.properties.isHidingZone = true;
        $loc.properties.questions = q;
        return withTeam({
            ...$loc,
            disabledStations: disabledStations,
            hidingRadius: radius,
            hidingRadiusUnits,
            alternateLocations: structuredClone(altLoc),
            displayHidingZones: showHidingZones,
            zoneOptions: zoneOptions,
            zoneOperators: zoneOperators,
            useCustomStations: useCustom,
            customStations: $customStations,
            includeDefaultStations: includeDefault,
            presets: structuredClone(presets),
            permanentOverlay: $permanentOverlay,
            defaultUnit: unit,
            displayHidingZonesStyle: zonesStyle,
        });
    },
);

export const drawingQuestionKey = atom<number>(-1);
export const planningModeEnabled = persistentJsonAtom<boolean>(
    "planningModeEnabled",
    false,
);
export const autoZoom = persistentJsonAtom<boolean>("autoZoom", true);

export const isLoading = atom<boolean>(false);

export const baseTileLayer = persistentAtom<
    "voyager" | "light" | "dark" | "transport" | "neighbourhood" | "osmcarto"
>("baseTileLayer", "voyager");
export const thunderforestApiKey = persistentAtom<string>(
    "thunderforestApiKey",
    "",
    {
        encode: (value: string) => value,
        decode: (value: string) => value,
    },
);
export const followMe = persistentJsonAtom<boolean>("followMe", false);
export const defaultCustomQuestions = persistentJsonAtom<boolean>(
    "defaultCustomQuestions",
    false,
);

export const pastebinApiKey = persistentAtom<string>("pastebinApiKey", "");
export const alwaysUsePastebin = persistentJsonAtom<boolean>(
    "alwaysUsePastebin",
    false,
);

export const showTutorial = persistentJsonAtom<boolean>("showTutorials", true);
export const tutorialStep = atom<number>(0);

export const customInitPreference = persistentJsonAtom<"ask" | "blank" | "prefill">(
    "customInitPreference",
    "ask",
);

export const allowGooglePlusCodes = persistentJsonAtom<boolean>(
    "allowGooglePlusCodes",
    false,
);
