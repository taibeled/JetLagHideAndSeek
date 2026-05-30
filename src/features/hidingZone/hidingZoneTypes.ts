import type {
    Feature,
    FeatureCollection,
    LineString,
    MultiLineString,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";

import type { Bbox } from "@/features/map/geojsonTypes";
import type {
    TransitRoute,
    TransitSource,
    TransitStationContribution,
} from "@/features/transit/transitTypes";
import type { DistanceUnit } from "@/shared/distanceUnits";

export type HidingZoneUnit = DistanceUnit;
export type {
    TransitRoute,
    TransitStation,
    TransitStationContribution,
} from "@/features/transit/transitTypes";

export type HidingZonePreset = {
    bbox: Bbox;
    defaultColor: string;
    id: string;
    label: string;
    operator: string;
    routes: TransitRoute[];
    source: TransitSource;
    stations: TransitStationContribution[];
};

export type RouteFeatureProperties = {
    color: string;
    id: string;
    name: string;
    presetId: string;
};

export type StationFeatureProperties = {
    color: string;
    id: string;
    name: string;
    ringCount: number;
    ringIndex: number;
};

export type ZoneFeatureProperties = {
    radiusMeters: number;
};

export type RouteFeatureCollection = FeatureCollection<
    LineString | MultiLineString,
    RouteFeatureProperties
>;

export type StationFeatureCollection = FeatureCollection<
    Point,
    StationFeatureProperties
>;

export type ZoneFeatureCollection = FeatureCollection<
    Polygon | MultiPolygon,
    ZoneFeatureProperties
>;

export type ZoneFeature = Feature<
    Polygon | MultiPolygon,
    ZoneFeatureProperties
>;
