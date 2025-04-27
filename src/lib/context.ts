import { atom, computed } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { type OpenStreetMap } from "../maps/api";
import type { Map } from "leaflet";
import {
    questionSchema,
    questionsSchema,
    type DeepPartial,
    type Question,
    type Questions,
    type Units,
} from "./schema";

export const mapGeoLocation = persistentAtom<OpenStreetMap>(
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
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const mapGeoJSON = atom<any>(null);
export const polyGeoJSON = persistentAtom<any>("polyGeoJSON", null, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export const questions = persistentAtom<Questions>("questions", [], {
    encode: JSON.stringify,
    decode: (x) => questionsSchema.parse(JSON.parse(x)),
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
export const highlightTrainLines = persistentAtom<boolean>(
    "highlightTrainLines",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const hiderMode = persistentAtom<
    | false
    | {
          latitude: number;
          longitude: number;
      }
>("isHiderMode", false, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const triggerLocalRefresh = atom<number>(0);
export const displayHidingZones = persistentAtom<boolean>(
    "displayHidingZones",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const displayHidingZonesOptions = persistentAtom<string[]>(
    "displayHidingZonesOptions",
    ["[railway=station]"],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const questionFinishedMapData = atom<any>(null);
export const trainStations = atom<any[]>([]);
export const animateMapMovements = persistentAtom<boolean>(
    "animateMapMovements",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const hidingRadius = persistentAtom<number>("hidingRadius", 0.5, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const disabledStations = persistentAtom<string[]>(
    "disabledStations",
    [],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const autoSave = persistentAtom<boolean>("autoSave", true, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const save = () => {
    questions.set([...questions.get()]);
    const $hiderMode = hiderMode.get();

    if ($hiderMode !== false) {
        hiderMode.set({ ...$hiderMode });
    }
};

// Exported hiding zone that can be loaded from clipboard or URL
export const hidingZone = computed(
    [questions, polyGeoJSON, mapGeoLocation, disabledStations, hidingRadius],
    (q, geo, loc, disabledStations, radius) => {
        if (geo !== null) {
            return {
                ...geo,
                questions: q,
                disabledStations: disabledStations,
                hidingRadius: radius,
            };
        } else {
            const $loc = structuredClone(loc);
            $loc.properties.isHidingZone = true;
            $loc.properties.questions = q;
            return {
                ...$loc,
                disabledStations: disabledStations,
                hidingRadius: radius,
            };
        }
    },
);

export const drawingQuestionKey = atom<number>(-1);
export const planningModeEnabled = persistentAtom<boolean>(
    "planningModeEnabled",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const isLoading = atom<boolean>(false);
