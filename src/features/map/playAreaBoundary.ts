import AsyncStorage from "@react-native-async-storage/async-storage";
import osmtogeojson from "osmtogeojson";

import osakaBoundaryJson from "../../../assets/default-zones/osaka.json";

import type { GeoJsonFeatureCollection } from "./geojsonTypes";
import {
    calculateBbox,
    calculateCenter,
    defaultPlayArea,
    type PlayArea,
    type PlayAreaCacheSource,
} from "./playArea";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const CACHE_PREFIX = "play-area-boundary:";
const BUNDLED_BOUNDARIES: Partial<Record<number, GeoJsonFeatureCollection>> = {
    358674: osakaBoundaryJson as unknown as GeoJsonFeatureCollection,
};

const memoryCache = new Map<number, PlayArea>();

export type LoadedPlayArea = {
    cacheSource: PlayAreaCacheSource;
    playArea: PlayArea;
};

export function parseRelationId(value: string): number | null {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;

    const relationId = Number(trimmed);
    if (!Number.isSafeInteger(relationId) || relationId <= 0) return null;

    return relationId;
}

export function isBundledPlayAreaId(relationId: number): boolean {
    return (
        relationId === defaultPlayArea.osmId || relationId in BUNDLED_BOUNDARIES
    );
}

export async function loadPlayAreaByRelationId(
    relationId: number,
): Promise<LoadedPlayArea> {
    if (relationId === defaultPlayArea.osmId) {
        memoryCache.set(relationId, defaultPlayArea);
        return { cacheSource: "bundled", playArea: defaultPlayArea };
    }

    const bundledBoundary = BUNDLED_BOUNDARIES[relationId];
    if (bundledBoundary) {
        const playArea = buildPlayAreaFromBoundary(relationId, bundledBoundary);
        memoryCache.set(relationId, playArea);
        return { cacheSource: "bundled", playArea };
    }

    const memoryHit = memoryCache.get(relationId);
    if (memoryHit) return { cacheSource: "memory", playArea: memoryHit };

    const cacheKey = getBoundaryCacheKey(relationId);
    const persisted = await AsyncStorage.getItem(cacheKey);
    if (persisted) {
        const playArea = JSON.parse(persisted) as PlayArea;
        memoryCache.set(relationId, playArea);
        return { cacheSource: "persisted", playArea };
    }

    const playArea = await fetchPlayAreaBoundary(relationId);
    memoryCache.set(relationId, playArea);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(playArea));
    return { cacheSource: "fetched", playArea };
}

export async function fetchPlayAreaBoundary(
    relationId: number,
): Promise<PlayArea> {
    const query = `[out:json][timeout:60];relation(${relationId});out geom qt;`;
    const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Overpass API error ${response.status}`);
    }

    const overpassJson = await response.json();
    return buildPlayAreaFromOverpass(relationId, overpassJson);
}

export function buildPlayAreaFromOverpass(
    relationId: number,
    overpassJson: unknown,
): PlayArea {
    const converted = osmtogeojson(overpassJson);
    const boundary = filterBoundaryFeatures(
        converted as unknown as GeoJsonFeatureCollection,
    );

    return buildPlayAreaFromBoundary(relationId, boundary);
}

export function buildPlayAreaFromBoundary(
    relationId: number,
    boundary: GeoJsonFeatureCollection,
): PlayArea {
    if (boundary.features.length === 0) {
        throw new Error(`No polygon boundary found for relation ${relationId}`);
    }

    const bbox = calculateBbox(boundary);
    return {
        bbox,
        boundary,
        center: calculateCenter(bbox),
        label: getBoundaryLabel(boundary, relationId),
        osmId: relationId,
        osmType: "R",
    };
}

export function clearPlayAreaMemoryCache() {
    memoryCache.clear();
}

function filterBoundaryFeatures(
    boundary: GeoJsonFeatureCollection,
): GeoJsonFeatureCollection {
    return {
        features: boundary.features.filter(
            (feature) =>
                feature.geometry.type === "Polygon" ||
                feature.geometry.type === "MultiPolygon",
        ),
        type: "FeatureCollection",
    };
}

function getBoundaryLabel(
    boundary: GeoJsonFeatureCollection,
    relationId: number,
): string {
    for (const feature of boundary.features) {
        const name = feature.properties?.name;
        if (typeof name === "string" && name.trim()) return name;
    }

    return `OSM relation ${relationId}`;
}

function getBoundaryCacheKey(relationId: number): string {
    return `${CACHE_PREFIX}${relationId}`;
}
