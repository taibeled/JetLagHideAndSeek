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

type BoundaryCacheEnvelope = {
    /** ISO-8601 timestamp of when the boundary was cached. */
    cachedAt: string;
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
    const cached = await loadCachedPlayAreaByRelationId(relationId);
    if (cached) return cached;

    const playArea = await fetchPlayAreaBoundary(relationId);
    await persistPlayAreaBoundary(playArea);
    return { cacheSource: "fetched", playArea };
}

export async function loadCachedPlayAreaByRelationId(
    relationId: number,
): Promise<LoadedPlayArea | null> {
    const bundled = getBundledPlayArea(relationId);
    if (bundled) {
        memoryCache.set(relationId, bundled);
        return { cacheSource: "bundled", playArea: bundled };
    }

    const memoryHit = memoryCache.get(relationId);
    if (memoryHit) return { cacheSource: "memory", playArea: memoryHit };

    const persisted = await readPersistedBoundary(relationId);
    if (!persisted) return null;

    memoryCache.set(relationId, persisted);
    return { cacheSource: "persisted", playArea: persisted };
}

export async function persistPlayAreaBoundary(playArea: PlayArea) {
    const memoryHit = memoryCache.get(playArea.osmId);
    memoryCache.set(playArea.osmId, playArea);
    if (isBundledPlayAreaId(playArea.osmId) || memoryHit === playArea) return;

    const envelope: BoundaryCacheEnvelope = {
        cachedAt: new Date().toISOString(),
        playArea,
    };
    await AsyncStorage.setItem(
        getBoundaryCacheKey(playArea.osmId),
        JSON.stringify(envelope),
    );
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

/**
 * Scan AsyncStorage for persisted boundary entries and seed the in-memory
 * cache so that subsequent {@link loadPlayAreaByRelationId} calls skip the
 * AsyncStorage read and avoid unnecessary Overpass fetches on restart.
 *
 * Call once during app startup (non-blocking — failures are silently ignored).
 */
export async function warmBoundaryCacheFromStorage(): Promise<void> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        for (const key of keys) {
            if (!key.startsWith(CACHE_PREFIX)) continue;

            const relationId = Number(key.slice(CACHE_PREFIX.length));
            if (!Number.isSafeInteger(relationId) || relationId <= 0) continue;

            // Skip if already in memory (e.g., bundled or already warmed).
            if (memoryCache.has(relationId)) continue;

            const playArea = await readPersistedBoundary(relationId);
            if (playArea) {
                memoryCache.set(relationId, playArea);
            }
        }
    } catch {
        // AsyncStorage may not be available — ignore.
    }
}

function getBundledPlayArea(relationId: number): PlayArea | null {
    if (relationId === defaultPlayArea.osmId) return defaultPlayArea;

    const bundledBoundary = BUNDLED_BOUNDARIES[relationId];
    return bundledBoundary
        ? buildPlayAreaFromBoundary(relationId, bundledBoundary)
        : null;
}

async function readPersistedBoundary(
    relationId: number,
): Promise<PlayArea | null> {
    const cacheKey = getBoundaryCacheKey(relationId);
    try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as unknown;
        const playArea =
            isRecord(parsed) && "playArea" in parsed ? parsed.playArea : parsed;
        if (!isPlayArea(playArea, relationId)) {
            await removeBoundaryCacheEntry(cacheKey);
            return null;
        }
        return playArea;
    } catch {
        await removeBoundaryCacheEntry(cacheKey);
        return null;
    }
}

async function removeBoundaryCacheEntry(cacheKey: string) {
    try {
        await AsyncStorage.removeItem(cacheKey);
    } catch {
        // Storage may be unavailable. Treat this as a cache miss either way.
    }
}

function isPlayArea(value: unknown, relationId: number): value is PlayArea {
    if (!isRecord(value)) return false;
    return (
        value.osmId === relationId &&
        value.osmType === "R" &&
        typeof value.label === "string" &&
        isNumberTuple(value.bbox, 4) &&
        isNumberTuple(value.center, 2) &&
        isRecord(value.boundary) &&
        value.boundary.type === "FeatureCollection" &&
        Array.isArray(value.boundary.features)
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberTuple(value: unknown, length: number): boolean {
    return (
        Array.isArray(value) &&
        value.length === length &&
        value.every((part) => typeof part === "number" && Number.isFinite(part))
    );
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
