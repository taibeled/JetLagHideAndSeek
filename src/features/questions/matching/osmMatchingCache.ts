import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Position } from "@/shared/geojson";
import { haversineDistanceMeters } from "@/shared/geojson";

import { getCategoryConfig } from "./matchingCategories";
import type { MatchingCategory, OsmFeature } from "./matchingTypes";
import {
    DEFAULT_SEARCH_RADIUS_METERS,
    fetchAndParseOverpassFeatures,
    rankMatchingFeatures,
    type OsmFeatureWithDistance,
} from "./osmMatching";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;
const CACHE_KEY_PREFIX = "osm-matching-cache:";
const MANIFEST_KEY = "osm-matching-manifest";

/** Raw features are valid for 90 days before a background refresh is triggered. */
export const MATCHING_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Ratio by which the fetch radius exceeds the requested radius. Fetching a
 * larger circle lets the cached result serve nearby follow-up searches without
 * a new Overpass request. The larger fetch radius adds more features to the
 * response but also extends the reuse window proportionally.
 */
export const OVERSCAN_FACTOR = 1.5;

/** Maximum number of entries kept in the in-process LRU. */
const MEMORY_LRU_MAX = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

type OsmMatchingCacheEntry = {
    schemaVersion: number;
    category: MatchingCategory;
    centerLat: number;
    centerLon: number;
    radiusMeters: number;
    fetchedAt: number;
    features: OsmFeature[];
};

type OsmMatchingManifestRow = {
    key: string;
    category: MatchingCategory;
    centerLat: number;
    centerLon: number;
    radiusMeters: number;
    fetchedAt: number;
    featureCount: number;
};

type OsmMatchingManifest = {
    schemaVersion: number;
    rows: OsmMatchingManifestRow[];
};

export type OsmMatchingCacheSource = "memory" | "disk" | "stale" | "network";

export type OsmMatchingFeaturesResult = {
    candidates: OsmFeatureWithDistance[];
    source: OsmMatchingCacheSource;
};

// ─── Module-level state ───────────────────────────────────────────────────────

// In-memory LRU. Map preserves insertion order; re-inserting an entry at the
// end is an O(1) promotion. The oldest (least recently used) entry is the
// first key returned by Map.keys().
const memoryLru = new Map<string, OsmMatchingCacheEntry>();

// Per-key in-flight deduplication so parallel callers share one Overpass request.
const inflight = new Map<string, Promise<OsmFeature[]>>();

// Manifest loaded lazily and kept in memory to avoid re-reading AsyncStorage.
let manifestCache: OsmMatchingManifest | null = null;

// Sequential promise chain that serializes manifest mutations so concurrent
// persistEntry calls for different keys do not lose rows via a read-modify-write
// race.
let manifestMutex: Promise<void> = Promise.resolve();

// ─── Spatial math ─────────────────────────────────────────────────────────────

/**
 * Returns true when every point within (requestedLat, requestedLon, requestedR)
 * is also within (cachedLat, cachedLon, cachedR). Proof:
 *   dist(cached, requested) + requestedR <= cachedR
 */
export function containsSearchCircle(
    cachedCenterLat: number,
    cachedCenterLon: number,
    cachedRadiusMeters: number,
    requestedCenterLat: number,
    requestedCenterLon: number,
    requestedRadiusMeters: number,
): boolean {
    const dist = haversineDistanceMeters(
        cachedCenterLat,
        cachedCenterLon,
        requestedCenterLat,
        requestedCenterLon,
    );
    return dist + requestedRadiusMeters <= cachedRadiusMeters;
}

/** Returns the overscan fetch radius for a given requested radius. */
export function getOverscanRadius(requestedRadiusMeters: number): number {
    return Math.ceil(requestedRadiusMeters * OVERSCAN_FACTOR);
}

// ─── Cache key ────────────────────────────────────────────────────────────────

function makeCacheKey(
    category: MatchingCategory,
    lat: number,
    lon: number,
    radiusMeters: number,
): string {
    // Round to ~1 cm precision to prevent IEEE-754 representation artifacts
    // (e.g. 35.680000000000001 vs 35.68) from producing different keys for
    // semantically identical coordinates.
    const rLat = Math.round(lat * 1e7) / 1e7;
    const rLon = Math.round(lon * 1e7) / 1e7;
    const rRadius = Math.round(radiusMeters);
    return `${CACHE_KEY_PREFIX}${category}:${rLat}:${rLon}:${rRadius}`;
}

// ─── Memory LRU helpers ───────────────────────────────────────────────────────

function memorySet(key: string, entry: OsmMatchingCacheEntry): void {
    memoryLru.delete(key);
    memoryLru.set(key, entry);
    while (memoryLru.size > MEMORY_LRU_MAX) {
        const oldest = memoryLru.keys().next().value;
        if (oldest !== undefined) memoryLru.delete(oldest);
    }
}

/** Finds the freshest in-memory entry whose coverage circle contains the request. */
function findInMemory(
    category: MatchingCategory,
    requestedLat: number,
    requestedLon: number,
    requestedRadius: number,
): { key: string; entry: OsmMatchingCacheEntry } | null {
    let best: { key: string; entry: OsmMatchingCacheEntry } | null = null;
    for (const [key, entry] of memoryLru) {
        if (entry.category !== category) continue;
        if (
            !containsSearchCircle(
                entry.centerLat,
                entry.centerLon,
                entry.radiusMeters,
                requestedLat,
                requestedLon,
                requestedRadius,
            )
        ) {
            continue;
        }
        if (!best || entry.fetchedAt > best.entry.fetchedAt) {
            best = { key, entry };
        }
    }
    return best;
}

// ─── Manifest helpers ─────────────────────────────────────────────────────────

async function loadManifest(): Promise<OsmMatchingManifest> {
    if (manifestCache) return manifestCache;
    try {
        const raw = await AsyncStorage.getItem(MANIFEST_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (isManifest(parsed)) {
                manifestCache = parsed;
                return manifestCache;
            }
        }
    } catch {
        // Treat corrupt or unavailable storage as an empty manifest.
    }
    manifestCache = { schemaVersion: SCHEMA_VERSION, rows: [] };
    return manifestCache;
}

async function saveManifest(manifest: OsmMatchingManifest): Promise<void> {
    manifestCache = manifest;
    try {
        await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
    } catch {
        // Storage may be unavailable; the in-memory manifestCache is still current.
    }
}

function isManifest(value: unknown): value is OsmMatchingManifest {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        (value as Record<string, unknown>).schemaVersion === SCHEMA_VERSION &&
        Array.isArray((value as Record<string, unknown>).rows)
    );
}

/** Returns the freshest manifest row whose coverage circle contains the request. */
function findInManifest(
    manifest: OsmMatchingManifest,
    category: MatchingCategory,
    requestedLat: number,
    requestedLon: number,
    requestedRadius: number,
): OsmMatchingManifestRow | null {
    let best: OsmMatchingManifestRow | null = null;
    for (const row of manifest.rows) {
        if (row.category !== category) continue;
        if (
            !containsSearchCircle(
                row.centerLat,
                row.centerLon,
                row.radiusMeters,
                requestedLat,
                requestedLon,
                requestedRadius,
            )
        ) {
            continue;
        }
        if (!best || row.fetchedAt > best.fetchedAt) {
            best = row;
        }
    }
    return best;
}

// ─── Disk helpers ─────────────────────────────────────────────────────────────

async function loadFromDisk(
    key: string,
): Promise<OsmMatchingCacheEntry | null> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        return isCacheEntry(parsed) ? parsed : null;
    } catch {
        // Return null without deleting the corrupt entry — removing it would
        // orphan the corresponding manifest row.
        return null;
    }
}

async function persistEntry(
    key: string,
    entry: OsmMatchingCacheEntry,
): Promise<void> {
    try {
        await AsyncStorage.setItem(key, JSON.stringify(entry));
    } catch {
        // Storage may be unavailable.
    }
    // Serialize manifest mutations through a sequential chain so concurrent
    // persistEntry calls for different keys do not lose rows.
    manifestMutex = manifestMutex
        .then(async () => {
            const manifest = await loadManifest();
            const row: OsmMatchingManifestRow = {
                key,
                category: entry.category,
                centerLat: entry.centerLat,
                centerLon: entry.centerLon,
                radiusMeters: entry.radiusMeters,
                fetchedAt: entry.fetchedAt,
                featureCount: entry.features.length,
            };
            const idx = manifest.rows.findIndex((r) => r.key === key);
            if (idx >= 0) {
                manifest.rows[idx] = row;
            } else {
                manifest.rows.push(row);
            }
            await saveManifest(manifest);
        })
        .catch(() => {
            // If a manifest mutation fails, allow subsequent mutations to
            // proceed.
        });
    await manifestMutex;
}

function isCacheEntry(value: unknown): value is OsmMatchingCacheEntry {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const obj = value as Record<string, unknown>;
    return (
        obj.schemaVersion === SCHEMA_VERSION &&
        typeof obj.category === "string" &&
        typeof obj.centerLat === "number" &&
        typeof obj.centerLon === "number" &&
        typeof obj.radiusMeters === "number" &&
        typeof obj.fetchedAt === "number" &&
        Array.isArray(obj.features)
    );
}

// ─── TTL / staleness ──────────────────────────────────────────────────────────

function isStale(entry: OsmMatchingCacheEntry): boolean {
    const ageMs = Date.now() - entry.fetchedAt;
    return ageMs < 0 || ageMs >= MATCHING_CACHE_TTL_MS;
}

// ─── Background revalidation ──────────────────────────────────────────────────

function revalidateInBackground(
    key: string,
    entry: OsmMatchingCacheEntry,
): void {
    if (inflight.has(key)) return;

    const revalidateCenter: Position = [entry.centerLon, entry.centerLat];
    const request = fetchAndParseOverpassFeatures(
        entry.category,
        revalidateCenter,
        entry.radiusMeters,
    )
        .then(async (features) => {
            const updated: OsmMatchingCacheEntry = {
                ...entry,
                features,
                fetchedAt: Date.now(),
            };
            memorySet(key, updated);
            await persistEntry(key, updated);
            return features;
        })
        .catch((err) => {
            // Keep serving the stale entry when Overpass is unavailable.
            console.warn(
                "[osmMatchingCache] background revalidation failed:",
                err,
            );
        })
        .finally(() => {
            inflight.delete(key);
        });

    inflight.set(key, request as Promise<OsmFeature[]>);
}

// ─── Network fetch with in-flight deduplication ───────────────────────────────

async function fetchAndStore(
    key: string,
    category: MatchingCategory,
    center: Position,
    radiusMeters: number,
    signal?: AbortSignal,
): Promise<OsmFeature[]> {
    const existing = inflight.get(key);
    if (existing) return existing;

    const [lon, lat] = center;
    const request = fetchAndParseOverpassFeatures(
        category,
        center,
        radiusMeters,
        signal,
    )
        .then(async (features) => {
            const entry: OsmMatchingCacheEntry = {
                schemaVersion: SCHEMA_VERSION,
                category,
                centerLat: lat,
                centerLon: lon,
                radiusMeters,
                fetchedAt: Date.now(),
                features,
            };
            memorySet(key, entry);
            await persistEntry(key, entry);
            return features;
        })
        .finally(() => {
            inflight.delete(key);
        });

    inflight.set(key, request);
    return request;
}

// ─── Category eligibility ─────────────────────────────────────────────────────

function isCacheable(category: MatchingCategory): boolean {
    if (category === "station-name-length") return true;
    const config = getCategoryConfig(category);
    return Boolean(config?.osmQueryTags);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns ranked OSM matching candidates using a multi-layer spatial cache:
 * in-memory LRU → persisted disk → Overpass network.
 *
 * A cached entry at (A, R) serves a request at (B, r) when
 * `dist(A, B) + r <= R`. Overpass fetches use an overscan radius so that
 * nearby follow-up searches reuse the cached result without a new request.
 *
 * Stale entries are returned immediately while a background refresh runs.
 */
export async function findMatchingFeaturesWithCache(
    category: MatchingCategory,
    center: Position,
    options?: {
        maxCandidates?: number;
        requestedRadiusMeters?: number;
        forceRefresh?: boolean;
        signal?: AbortSignal;
    },
): Promise<OsmMatchingFeaturesResult> {
    if (!isCacheable(category)) {
        return { candidates: [], source: "network" };
    }

    const [lon, lat] = center;
    const requestedRadius =
        options?.requestedRadiusMeters ?? DEFAULT_SEARCH_RADIUS_METERS;
    const maxCandidates = options?.maxCandidates ?? 10;
    const overscanRadius = getOverscanRadius(requestedRadius);

    if (!options?.forceRefresh) {
        // 1. Memory LRU: find the freshest covering entry.
        const memHit = findInMemory(category, lat, lon, requestedRadius);
        if (memHit) {
            // Promote to most-recently-used.
            memoryLru.delete(memHit.key);
            memoryLru.set(memHit.key, memHit.entry);

            if (isStale(memHit.entry)) {
                revalidateInBackground(memHit.key, memHit.entry);
                return {
                    candidates: rankMatchingFeatures(
                        memHit.entry.features,
                        center,
                        maxCandidates,
                    ),
                    source: "stale",
                };
            }
            return {
                candidates: rankMatchingFeatures(
                    memHit.entry.features,
                    center,
                    maxCandidates,
                ),
                source: "memory",
            };
        }

        // 2. Manifest → disk: find the freshest covering row.
        const manifest = await loadManifest();
        const row = findInManifest(
            manifest,
            category,
            lat,
            lon,
            requestedRadius,
        );
        if (row) {
            const diskEntry = await loadFromDisk(row.key);
            if (diskEntry) {
                memorySet(row.key, diskEntry);
                if (isStale(diskEntry)) {
                    revalidateInBackground(row.key, diskEntry);
                    return {
                        candidates: rankMatchingFeatures(
                            diskEntry.features,
                            center,
                            maxCandidates,
                        ),
                        source: "stale",
                    };
                }
                return {
                    candidates: rankMatchingFeatures(
                        diskEntry.features,
                        center,
                        maxCandidates,
                    ),
                    source: "disk",
                };
            }
        }
    }

    // 3. Network fetch with in-flight deduplication.
    const fetchKey = makeCacheKey(category, lat, lon, overscanRadius);
    // When force-refreshing, discard any in-flight request so the caller
    // does not receive a promise that was already aborted by the preceding
    // abort() call in performSearch.
    if (options?.forceRefresh) {
        inflight.delete(fetchKey);
    }
    const features = await fetchAndStore(
        fetchKey,
        category,
        center,
        overscanRadius,
        options?.signal,
    );

    return {
        candidates: rankMatchingFeatures(features, center, maxCandidates),
        source: "network",
    };
}

/** Clears the in-process memory cache and manifest. Call in tests to reset state. */
export function clearOsmMatchingMemoryCache(): void {
    memoryLru.clear();
    inflight.clear();
    manifestCache = null;
    manifestMutex = Promise.resolve();
}
