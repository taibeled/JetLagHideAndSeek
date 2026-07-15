import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import type { LatLngTuple } from "leaflet";

import type { APILocations, Question } from "@/maps/schema";

export interface OpenStreetMap {
    type: string;
    geometry: OpenStreetMapGeometry;
    properties: OpenStreetMapProperties;
}

export interface OpenStreetMapGeometry {
    type: string;
    coordinates: LatLngTuple;
}

export interface OpenStreetMapProperties {
    osm_type: "W" | "R" | "N";
    osm_id: number;
    extent?: number[];
    country?: string;
    state?: string;
    osm_key: string;
    countrycode: string;
    osm_value: string;
    name: string;
    type: string;
    isHidingZone?: boolean;
    questions?: Question[];
}

export interface AdditionalMapGeoLocations {
    added: boolean;
    location: OpenStreetMap;
    base: boolean;
}

export enum QuestionSpecificLocation {
    McDonalds = '["brand:wikidata"="Q38076"]',
    Seven11 = '["brand:wikidata"="Q259340"]',
}

export enum CacheType {
    CACHE = "jlhs-map-generator-cache",
    ZONE_CACHE = "jlhs-map-generator-zone-cache",
    PERMANENT_CACHE = "jlhs-map-generator-permanent-cache",
}

export interface CustomStation {
    id: string;
    name?: string;
    lat: number;
    lng: number;
}

export interface StationPlaceProperties {
    id: string;
    [key: string]: string | undefined;
}

export type StationPlace = Feature<Point, StationPlaceProperties>;
export type StationCircle = Feature<Polygon, StationPlace>;

/**
 * Categories of point-like places that can be sourced from a user-imported
 * local list instead of the Overpass API. Each maps to an Overpass tag filter
 * at the call sites; when the local list has no data for a category, the
 * Overpass query is used as a fallback.
 */
export type LocalPointCategory =
    | "airport"
    | "major-city"
    | "station"
    | "mcdonalds"
    | "seven11"
    | APILocations;

/** OSM administrative levels usable for local boundary matching. */
export type LocalAdminLevel = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * User-imported local place data. `points` holds point features per category
 * (nearest-place questions); `boundaries` holds administrative boundary
 * polygons per admin level (point-in-polygon zone questions).
 */
export interface LocalPlaceData {
    points: Partial<Record<LocalPointCategory, Feature<Point>[]>>;
    boundaries: Partial<
        Record<LocalAdminLevel, Feature<Polygon | MultiPolygon>[]>
    >;
}

export type {
    APILocations,
    EncompassingTentacleQuestionSchema,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
} from "@/maps/schema";
