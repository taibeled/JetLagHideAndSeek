import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Point, Polygon } from "geojson";

import { localPlaceData, mapGeoJSON, polyGeoJSON } from "@/lib/context";

import type { LocalAdminLevel, LocalPointCategory } from "./types";

/** Every point category that can be sourced from the local list. */
export const LOCAL_POINT_CATEGORIES: LocalPointCategory[] = [
    "airport",
    "major-city",
    "station",
    "mcdonalds",
    "seven11",
    "aquarium",
    "zoo",
    "theme_park",
    "peak",
    "museum",
    "hospital",
    "cinema",
    "library",
    "golf_course",
    "consulate",
    "park",
];

/** Every administrative level usable for local boundary matching. */
export const LOCAL_ADMIN_LEVELS: LocalAdminLevel[] = [
    2, 3, 4, 5, 6, 7, 8, 9, 10,
];

/**
 * Overpass-style element, as produced by `getOverpassData`. Local lookups
 * return the same shape so existing callers (which read `.elements`, map to
 * `turf.point`, or feed the result to `osmtogeojson`) keep working unchanged.
 */
export interface LocalOverpassElement {
    type: "node";
    id: number;
    lat: number;
    lon: number;
    tags: Record<string, string>;
}

/**
 * The polygon(s) that define the current game boundary, taken from the custom
 * drawn polygon (`polyGeoJSON`) or the rendered map GeoJSON (`mapGeoJSON`).
 * Used to clip local points to the active zone. Empty when no boundary is
 * available (in which case local points are used as-is).
 */
const getZonePolygons = (): Feature<Polygon | MultiPolygon>[] => {
    const collection = polyGeoJSON.get() ?? mapGeoJSON.get();
    if (!collection) return [];
    return collection.features.filter(
        (feature): feature is Feature<Polygon | MultiPolygon> =>
            feature.geometry?.type === "Polygon" ||
            feature.geometry?.type === "MultiPolygon",
    );
};

const isInsideZone = (
    point: Feature<Point>,
    zone: Feature<Polygon | MultiPolygon>[],
): boolean => zone.some((poly) => turf.booleanPointInPolygon(point, poly));

/**
 * Returns the imported local points for a category, clipped to the current
 * game boundary when one is available. Returns an empty array when the
 * category has no imported data (or none inside the zone), which signals the
 * caller to fall back to Overpass.
 */
export const getLocalPoints = (
    category: LocalPointCategory,
): Feature<Point>[] => {
    const points = localPlaceData.get().points[category];
    if (!points || points.length === 0) return [];

    const zone = getZonePolygons();
    if (zone.length === 0) return points;

    return points.filter((point) => isInsideZone(point, zone));
};

/**
 * Converts local point features into Overpass-element shape.
 *
 * The airport question dedups elements by `tags.iata`, so we always populate a
 * unique `iata` tag (falling back to name/id) to avoid collapsing the list to
 * a single point. Any string-valued feature properties are carried over as
 * tags so downstream name matching (name / name:en) keeps working.
 */
export const localPointsToElements = (
    points: Feature<Point>[],
    category: LocalPointCategory,
): { elements: LocalOverpassElement[] } => {
    const elements = points.map((point, index) => {
        const [lon, lat] = point.geometry.coordinates;
        const id =
            typeof point.id === "number"
                ? point.id
                : Number.parseInt(String(point.id ?? index + 1), 10) ||
                  index + 1;

        const tags: Record<string, string> = {};
        for (const [key, value] of Object.entries(point.properties ?? {})) {
            if (typeof value === "string") tags[key] = value;
        }

        if (category === "airport" && !tags.iata) {
            tags.iata = tags.name ?? tags["name:en"] ?? String(id);
        }

        return { type: "node" as const, id, lat, lon, tags };
    });

    return { elements };
};

/**
 * Returns the imported local administrative boundary at `adminLevel` that
 * contains the given coordinate, or `null` when there is no matching local
 * boundary (signalling the caller to fall back to Overpass).
 */
export const getLocalBoundary = (
    lat: number,
    lng: number,
    adminLevel: LocalAdminLevel,
): Feature<Polygon | MultiPolygon> | null => {
    const boundaries = localPlaceData.get().boundaries[adminLevel];
    if (!boundaries || boundaries.length === 0) return null;

    const point = turf.point([lng, lat]);
    return (
        boundaries.find((boundary) =>
            turf.booleanPointInPolygon(point, boundary),
        ) ?? null
    );
};
