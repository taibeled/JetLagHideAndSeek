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

export type HidingZoneUnit = "m" | "km" | "mi";

export type TransitRoute = {
    color: string;
    geometry: MultiLineString;
    id: string;
    name: string;
};

export type TransitStation = {
    id: string;
    lat: number;
    lon: number;
    name: string;
    routeColors?: string[];
    routeIds: string[];
};

export type HidingZonePreset = {
    bbox: Bbox;
    defaultColor: string;
    id: string;
    label: string;
    operator: string;
    routes: TransitRoute[];
    stations: TransitStation[];
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
