import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { type OpenStreetMap } from "../maps/api";
import type { RadiusQuestion } from "../maps/radius";
import type { ThermometerQuestion } from "../maps/thermometer";
import type { TentacleQuestion } from "../maps/tentacles";
import type { MatchingQuestion } from "../maps/matching";
import type { Map } from "leaflet";
import type { Units } from "@turf/turf";
import type { MeasuringQuestion } from "@/maps/measuring";

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

export type Question =
    | { id: "radius"; key: number; data: RadiusQuestion }
    | { id: "thermometer"; key: number; data: ThermometerQuestion }
    | { id: "tentacles"; key: number; data: TentacleQuestion }
    | { id: "measuring"; key: number; data: MeasuringQuestion }
    | { id: "matching"; key: number; data: MatchingQuestion };

export const questions = persistentAtom<Question[]>("questions", [], {
    encode: JSON.stringify,
    decode: JSON.parse,
});

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
export const questionFinishedMapData = atom<any>(null);
export const trainStations = atom<any[]>([]);
