import AsyncStorage from "@react-native-async-storage/async-storage";

import osakaBoundaryJson from "../../../assets/default-zones/osaka.json";

import type { GeoJsonFeatureCollection } from "./geojsonTypes";
import {
    defaultPlayArea,
    type PlayArea,
    type PlayAreaCacheSource,
} from "./playArea";
export {
    buildPlayAreaFromBoundary,
    buildPlayAreaFromOverpass,
} from "./playAreaBoundaryConversion";
import {
    buildPlayAreaFromBoundary,
    buildPlayAreaFromOverpass,
} from "./playAreaBoundaryConversion";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const CACHE_PREFIX = "play-area-boundary:";
export const BOUNDARY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BUNDLED_BOUNDARIES: Partial<Record<number, GeoJsonFeatureCollection>> = {
    358674: osakaBoundaryJson as unknown as GeoJsonFeatureCollection,
};

type BoundaryCacheEntry = {
    cachedAt: string | null;
    playArea: PlayArea;
};

const memoryCache = new Map<number, BoundaryCacheEntry>();
const boundaryRevalidations = new Map<number, Promise<void>>();

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
        return { cacheSource: "bundled", playArea: bundled };
    }

    const memoryHit = memoryCache.get(relationId);
    if (memoryHit) {
        revalidateBoundaryIfStale(relationId, memoryHit);
        return { cacheSource: "memory", playArea: memoryHit.playArea };
    }

    const persisted = await readPersistedBoundary(relationId);
    if (!persisted) return null;

    memoryCache.set(relationId, persisted);
    revalidateBoundaryIfStale(relationId, persisted);
    return { cacheSource: "persisted", playArea: persisted.playArea };
}

export async function persistPlayAreaBoundary(playArea: PlayArea) {
    const envelope: BoundaryCacheEnvelope = {
        cachedAt: new Date().toISOString(),
        playArea,
    };
    if (isBundledPlayAreaId(playArea.osmId)) return;

    const memoryHit = memoryCache.get(playArea.osmId);
    if (memoryHit?.playArea === playArea) return;

    memoryCache.set(playArea.osmId, envelope);
    await AsyncStorage.setItem(
        getBoundaryCacheKey(playArea.osmId),
        JSON.stringify(envelope),
    );
}

/**
 * App-state writes only need a durable boundary reference. They must not
 * replace an existing cache record because the live state may still hold the
 * stale object returned immediately before a background refresh completed.
 */
export async function ensurePlayAreaBoundaryCached(playArea: PlayArea) {
    if (
        isBundledPlayAreaId(playArea.osmId) ||
        memoryCache.has(playArea.osmId)
    ) {
        return;
    }

    const persisted = await readPersistedBoundary(playArea.osmId);
    if (persisted) {
        if (!memoryCache.has(playArea.osmId)) {
            memoryCache.set(playArea.osmId, persisted);
        }
        return;
    }
    if (memoryCache.has(playArea.osmId)) return;
    await persistPlayAreaBoundary(playArea);
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

            // Skip if already loaded or warmed.
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
): Promise<BoundaryCacheEntry | null> {
    const cacheKey = getBoundaryCacheKey(relationId);
    try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as unknown;
        const isEnvelope = isRecord(parsed) && "playArea" in parsed;
        const playArea = isEnvelope ? parsed.playArea : parsed;
        if (!isPlayArea(playArea, relationId)) {
            await removeBoundaryCacheEntry(cacheKey);
            return null;
        }
        return {
            cachedAt:
                isEnvelope && typeof parsed.cachedAt === "string"
                    ? parsed.cachedAt
                    : null,
            playArea,
        };
    } catch {
        await removeBoundaryCacheEntry(cacheKey);
        return null;
    }
}

function revalidateBoundaryIfStale(
    relationId: number,
    cacheEntry: BoundaryCacheEntry,
) {
    if (
        !isBoundaryCacheEntryStale(cacheEntry) ||
        boundaryRevalidations.has(relationId)
    ) {
        return;
    }

    const revalidation = fetchPlayAreaBoundary(relationId)
        .then(persistPlayAreaBoundary)
        .catch(() => {
            // Keep serving the stale boundary when Overpass is unavailable.
        })
        .finally(() => {
            boundaryRevalidations.delete(relationId);
        });
    boundaryRevalidations.set(relationId, revalidation);
}

function isBoundaryCacheEntryStale(cacheEntry: BoundaryCacheEntry): boolean {
    if (!cacheEntry.cachedAt) return true;

    const cachedAtMs = Date.parse(cacheEntry.cachedAt);
    const ageMs = Date.now() - cachedAtMs;
    return (
        !Number.isFinite(cachedAtMs) ||
        ageMs < 0 ||
        ageMs >= BOUNDARY_CACHE_TTL_MS
    );
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

function getBoundaryCacheKey(relationId: number): string {
    return `${CACHE_PREFIX}${relationId}`;
}
