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

export type QuestionType =
    | "radar"
    | "matching"
    | "measuring"
    | "thermometer"
    | "tentacles";

export type ImplementedQuestionType = "radar";

export type RadarDistanceOption =
    | "500m"
    | "1km"
    | "2km"
    | "5km"
    | "10km"
    | "15km"
    | "40km"
    | "80km"
    | "150km"
    | "other";

export const radarDistancePresetOptions: Exclude<
    RadarDistanceOption,
    "other"
>[] = ["500m", "1km", "2km", "5km", "10km", "15km", "40km", "80km", "150km"];

export const radarDistanceOptionMeters: Record<
    Exclude<RadarDistanceOption, "other">,
    number
> = {
    "500m": 500,
    "1km": 1000,
    "2km": 2000,
    "5km": 5000,
    "10km": 10000,
    "15km": 15000,
    "40km": 40000,
    "80km": 80000,
    "150km": 150000,
};

export type BaseQuestion = {
    createdAt: string;
    id: string;
    type: QuestionType;
    updatedAt: string;
};

export type RadarQuestion = BaseQuestion & {
    center: Position;
    distanceMeters: number;
    distanceOption: RadarDistanceOption;
    distanceUnit: HidingZoneUnit;
    type: "radar";
};

export type QuestionState = RadarQuestion;
export type QuestionsImportState = QuestionState[];

export type RadarQuestionFeatureProperties = {
    distanceMeters: number;
    id: string;
};

export type RadarQuestionFeatureCollection = FeatureCollection<
    Polygon | MultiPolygon,
    RadarQuestionFeatureProperties
>;

export type QuestionPinProperties = {
    id: string;
};

export type QuestionPinFeature = Feature<Point, QuestionPinProperties>;

export type QuestionMapRenderState = {
    radarAreaFeatures: RadarQuestionFeatureCollection;
};

export type NearestStationInfo = {
    distanceMeters: number;
    station: TransitStation;
} | null;
