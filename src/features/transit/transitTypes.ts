import type { MultiLineString } from "geojson";

export type TransitSource =
    | { kind: "gtfs"; namespace: string }
    | { kind: "osm"; namespace: "openstreetmap" };

export type TransitRoute = {
    color: string;
    geometry: MultiLineString;
    id: string;
    name: string;
    sourceId: string;
};

export type TransitStationContribution = {
    id: string;
    lat: number;
    lon: number;
    mergeKey: string;
    name: string;
    routeIds: string[];
    sourceId: string;
};

export type TransitStation = {
    id: string;
    lat: number;
    lon: number;
    name: string;
    routeColors?: string[];
    routeIds: string[];
    sourceStationIds?: string[];
};
