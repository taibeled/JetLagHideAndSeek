import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";

import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import type { Position } from "@/shared/geojson";
import type {
    BaseQuestion,
    QuestionAnswer,
} from "@/features/questions/coreTypes";
import type { TransitLineQuestionFeatureCollection } from "@/features/questions/transitLine/transitLineTypes";
import type { DistanceUnit } from "@/shared/distanceUnits";

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

export type RadarQuestion = BaseQuestion & {
    answer: QuestionAnswer;
    center: Position;
    distanceMeters: number;
    distanceOption: RadarDistanceOption;
    distanceUnit: DistanceUnit;
    type: "radar";
};

export type RadarQuestionFeatureProperties = {
    answer: QuestionAnswer;
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

export type RadarQuestionRenderState = {
    hitMaskFeatures: RadarQuestionFeatureCollection;
    missMaskFeatures: RadarQuestionFeatureCollection;
    outlineFeatures: RadarQuestionFeatureCollection;
    previewFeatures: RadarQuestionFeatureCollection;
};

export type OsmMatchingRenderState = {
    hitMaskFeatures: FeatureCollection<Polygon | MultiPolygon>;
    missMaskFeatures: FeatureCollection<Polygon | MultiPolygon>;
    poiFeatures: FeatureCollection<
        Point,
        { isSelected: boolean; name: string; osmId: number }
    >;
};

export type QuestionMapRenderState = {
    osmMatching: OsmMatchingRenderState;
    radar: RadarQuestionRenderState;
    radarAreaFeatures: RadarQuestionFeatureCollection;
    transitLine: {
        hitMaskFeatures: TransitLineQuestionFeatureCollection;
        missMaskFeatures: TransitLineQuestionFeatureCollection;
    };
};

export type NearestStationInfo = {
    distanceMeters: number;
    station: TransitStation;
} | null;
