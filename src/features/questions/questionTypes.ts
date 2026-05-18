import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";

import type {
    HidingZoneUnit,
    TransitStation,
} from "@/features/hidingZone/hidingZoneTypes";
import type { Position } from "@/features/map/geojsonTypes";

export type RadiusOption = "500m" | "1km" | "2km" | "5km" | "10km" | "other";

export const radiusPresetOptions: Exclude<RadiusOption, "other">[] = [
    "500m",
    "1km",
    "2km",
    "5km",
    "10km",
];

export const radiusOptionMeters: Record<
    Exclude<RadiusOption, "other">,
    number
> = {
    "500m": 500,
    "1km": 1000,
    "2km": 2000,
    "5km": 5000,
    "10km": 10000,
};

export type RadiusQuestion = {
    center: Position;
    createdAt: string;
    id: string;
    radiusMeters: number;
    radiusOption: RadiusOption;
    radiusUnit: HidingZoneUnit;
    type: "radius";
    updatedAt: string;
};

export type QuestionState = RadiusQuestion;
export type QuestionsImportState = QuestionState[];

export type RadiusQuestionFeatureProperties = {
    id: string;
    radiusMeters: number;
};

export type RadiusQuestionFeatureCollection = FeatureCollection<
    Polygon | MultiPolygon,
    RadiusQuestionFeatureProperties
>;

export type RadiusQuestionPinProperties = {
    id: string;
};

export type RadiusQuestionPinFeature = Feature<
    Point,
    RadiusQuestionPinProperties
>;

export type NearestStationInfo = {
    distanceMeters: number;
    station: TransitStation;
} | null;
