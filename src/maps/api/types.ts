import type { LatLngTuple } from "leaflet";

import type { Question } from "@/maps/schema";

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

export type {
    APILocations,
    EncompassingTentacleQuestionSchema,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
} from "@/maps/schema";
