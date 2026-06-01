import circle from "@turf/circle";
import { featureCollection } from "@turf/helpers";
import union from "@turf/union";

import {
    bboxIntersects,
    EARTH_RADIUS_METERS,
    type Bbox,
} from "@/shared/geojson";
import {
    fromMeters as fromDistanceMeters,
    toMeters as toDistanceMeters,
} from "@/shared/distanceUnits";

import type { Feature, Polygon } from "geojson";
import type {
    HidingZonePreset,
    HidingZoneUnit,
    RouteFeatureCollection,
    StationFeatureCollection,
    TransitRoute,
    TransitStation,
    ZoneFeatureCollection,
    ZoneFeature,
    ZoneFeatureProperties,
} from "./hidingZoneTypes";

const STATION_FALLBACK_COLOR = "#1f6f78";

export function getSuggestedPresetIds(
    presets: HidingZonePreset[],
    playAreaBbox: Bbox,
): string[] {
    return presets
        .filter((preset) => bboxIntersects(preset.bbox, playAreaBbox))
        .map((preset) => preset.id);
}

export function toMeters(value: string, unit: HidingZoneUnit): number | null {
    return toDistanceMeters(value, unit);
}

export function fromMeters(meters: number, unit: HidingZoneUnit): string {
    return fromDistanceMeters(meters, unit);
}

export function getSelectedPresets(
    presets: HidingZonePreset[],
    selectedPresetIds: string[],
): HidingZonePreset[] {
    const selected = new Set(selectedPresetIds);
    return presets.filter((preset) => selected.has(preset.id));
}

export function getSelectedRoutes(presets: HidingZonePreset[]): TransitRoute[] {
    const routes = new Map<string, TransitRoute>();
    for (const preset of presets) {
        for (const route of preset.routes) {
            routes.set(route.id, route);
        }
    }
    return [...routes.values()];
}

export function getSelectedStations(
    presets: HidingZonePreset[],
): TransitStation[] {
    const stations = new Map<string, TransitStation>();
    for (const preset of presets) {
        const routeColorById = new Map(
            preset.routes.map((route) => [
                route.id,
                route.color || preset.defaultColor,
            ]),
        );
        for (const station of preset.stations) {
            const routeColors = getStationRouteColors(
                station.routeIds,
                routeColorById,
                preset.defaultColor,
            );
            const existing = stations.get(station.mergeKey);
            if (existing) {
                existing.routeIds = [
                    ...new Set([...existing.routeIds, ...station.routeIds]),
                ].sort();
                existing.routeColors = [
                    ...new Set([
                        ...(existing.routeColors ?? []),
                        ...routeColors,
                    ]),
                ];
                existing.sourceStationIds = [
                    ...new Set([
                        ...(existing.sourceStationIds ?? []),
                        station.id,
                    ]),
                ].sort();
            } else {
                stations.set(station.mergeKey, {
                    id: station.mergeKey,
                    lat: station.lat,
                    lon: station.lon,
                    name: station.name,
                    routeColors,
                    routeIds: [...station.routeIds].sort(),
                    sourceStationIds: [station.id],
                });
            }
        }
    }
    return [...stations.values()];
}

export function buildRouteFeatureCollection(
    presets: HidingZonePreset[],
): RouteFeatureCollection {
    return {
        features: presets.flatMap((preset) =>
            preset.routes.map((route) => ({
                geometry: route.geometry,
                properties: {
                    color: route.color || preset.defaultColor,
                    id: route.id,
                    name: route.name,
                    presetId: preset.id,
                },
                type: "Feature" as const,
            })),
        ),
        type: "FeatureCollection",
    };
}

export function buildStationFeatureCollection(
    stations: TransitStation[],
): StationFeatureCollection {
    return {
        features: stations.flatMap((station) => {
            const routeColors =
                station.routeColors && station.routeColors.length > 0
                    ? station.routeColors
                    : [STATION_FALLBACK_COLOR];

            return routeColors.map((color, ringIndex) => ({
                geometry: {
                    coordinates: [station.lon, station.lat],
                    type: "Point" as const,
                },
                properties: {
                    color,
                    id: station.id,
                    name: station.name,
                    ringCount: routeColors.length,
                    ringIndex,
                },
                type: "Feature" as const,
            }));
        }),
        type: "FeatureCollection",
    };
}

const MAX_ZONE_CACHE_SIZE = 30;
const zoneFeatureCache = new Map<string, ZoneFeatureCollection>();

const CIRCLE_ALGORITHM_VERSION = 1;
const CIRCLE_STEPS = 48;
const MAX_CIRCLE_CACHE_SIZE = 500;
const MAX_COMPONENT_CACHE_SIZE = 50;

interface CachedCircle {
    feature: Feature<Polygon, ZoneFeatureProperties>;
    bbox: Bbox;
}

const circleCache = new Map<string, CachedCircle>();
const componentFeatureCache = new Map<string, ZoneFeature>();

export function clearHidingZoneFeatureCache() {
    zoneFeatureCache.clear();
    circleCache.clear();
    componentFeatureCache.clear();
}

function stationSignature(station: TransitStation): string {
    // Round to ~1 cm precision to avoid floating-point key drift across
    // serialization round-trips (consistent with osmMatchingCache).
    const lon = Math.round(station.lon * 1e7) / 1e7;
    const lat = Math.round(station.lat * 1e7) / 1e7;
    return `${station.id}@${lon},${lat}`;
}

function zoneCacheKey(
    stations: TransitStation[],
    radiusMeters: number,
): string {
    return `${stations.map(stationSignature).sort().join(",")}|${radiusMeters}|${CIRCLE_STEPS}|${CIRCLE_ALGORITHM_VERSION}`;
}

function circleCacheKey(station: TransitStation, radiusMeters: number): string {
    return `${stationSignature(station)}|${radiusMeters}|${CIRCLE_STEPS}|${CIRCLE_ALGORITHM_VERSION}`;
}

function componentCacheKey(signatures: string[], radiusMeters: number): string {
    return `${signatures.join(",")}|${radiusMeters}|${CIRCLE_ALGORITHM_VERSION}`;
}

function circleBbox(lat: number, lon: number, radiusMeters: number): Bbox {
    const latRad = (lat * Math.PI) / 180;
    const dLat = (radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
    const cosLat = Math.cos(latRad);
    const dLon =
        cosLat > 0.001
            ? ((radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI)) / cosLat
            : 180;

    // 1% margin ensures no false negatives from polygon discretization.
    const margin = 1.01;
    return [
        lon - dLon * margin,
        lat - dLat * margin,
        lon + dLon * margin,
        lat + dLat * margin,
    ];
}

function buildOverlapGraph(bboxes: Map<string, Bbox>): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    const ids = [...bboxes.keys()];

    for (const id of ids) {
        graph.set(id, []);
    }

    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const idA = ids[i];
            const idB = ids[j];
            if (bboxIntersects(bboxes.get(idA)!, bboxes.get(idB)!)) {
                graph.get(idA)!.push(idB);
                graph.get(idB)!.push(idA);
            }
        }
    }

    return graph;
}

function findConnectedComponents(graph: Map<string, string[]>): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const node of graph.keys()) {
        if (visited.has(node)) continue;

        const component: string[] = [];
        const queue = [node];
        let head = 0;
        visited.add(node);

        while (head < queue.length) {
            const current = queue[head++];
            component.push(current);
            for (const neighbor of graph.get(current)!) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        components.push(component);
    }

    return components;
}

function getOrCreateCircle(
    station: TransitStation,
    radiusMeters: number,
): CachedCircle {
    const key = circleCacheKey(station, radiusMeters);
    const cached = circleCache.get(key);
    if (cached) {
        circleCache.delete(key);
        circleCache.set(key, cached);
        return cached;
    }

    const polygon = circle([station.lon, station.lat], radiusMeters / 1000, {
        properties: { radiusMeters },
        steps: CIRCLE_STEPS,
        units: "kilometers",
    }) as Feature<Polygon, ZoneFeatureProperties>;

    const bbox = circleBbox(station.lat, station.lon, radiusMeters);

    lruEvict(circleCache, MAX_CIRCLE_CACHE_SIZE);

    const entry: CachedCircle = { feature: polygon, bbox };
    circleCache.set(key, entry);
    return entry;
}

function lruEvict<K, V>(map: Map<K, V>, maxSize: number): void {
    if (map.size >= maxSize) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
    }
}

export function buildHidingZoneFeatureCollection(
    stations: TransitStation[],
    radiusMeters: number,
): ZoneFeatureCollection {
    if (stations.length === 0) {
        return { features: [], type: "FeatureCollection" };
    }

    // Exact-match full-result cache.
    const exactKey = zoneCacheKey(stations, radiusMeters);
    const exactCached = zoneFeatureCache.get(exactKey);
    if (exactCached) {
        zoneFeatureCache.delete(exactKey);
        zoneFeatureCache.set(exactKey, exactCached);
        return exactCached;
    }

    // Compute signatures and analytical bboxes before circle generation.
    const indexSignatures = new Map<string, string>();
    const bboxes = new Map<string, Bbox>();

    for (let i = 0; i < stations.length; i++) {
        const idx = String(i);
        const s = stations[i];
        indexSignatures.set(idx, stationSignature(s));
        bboxes.set(idx, circleBbox(s.lat, s.lon, radiusMeters));
    }

    // Build overlap graph and find connected components.
    const graph = buildOverlapGraph(bboxes);
    const rawComponents = findConnectedComponents(graph);

    // Precompute sorted signatures and sort keys for each component
    // so the sort comparator and loop body don't recompute sorts.
    const componentData = rawComponents.map((component) => {
        const compSigs = component
            .map((idx) => indexSignatures.get(idx)!)
            .sort();
        return {
            component,
            compSigs,
            sortKey: compSigs.join(","),
        };
    });

    componentData.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Build each component's feature, reusing cached results when possible.
    const features: ZoneFeature[] = [];

    for (const { component, compSigs } of componentData) {
        const compKey = componentCacheKey(compSigs, radiusMeters);
        const cached = componentFeatureCache.get(compKey);

        if (cached) {
            componentFeatureCache.delete(compKey);
            componentFeatureCache.set(compKey, cached);
            features.push(cached);
            continue;
        }

        const circles = component.map((idx) =>
            getOrCreateCircle(stations[Number(idx)], radiusMeters),
        );

        let feature: ZoneFeature;

        if (circles.length === 1) {
            feature = circles[0].feature as ZoneFeature;
        } else {
            const merged = union(
                featureCollection(circles.map((c) => c.feature)),
                { properties: { radiusMeters } },
            ) as ZoneFeature | null;

            if (!merged) {
                // Union failed — emit individual circles so no station
                // zone is silently dropped.
                for (const c of circles) {
                    features.push(c.feature as ZoneFeature);
                }
                continue;
            }
            feature = merged;
        }

        lruEvict(componentFeatureCache, MAX_COMPONENT_CACHE_SIZE);
        componentFeatureCache.set(compKey, feature);
        features.push(feature);
    }

    const result: ZoneFeatureCollection = {
        type: "FeatureCollection",
        features,
    };

    lruEvict(zoneFeatureCache, MAX_ZONE_CACHE_SIZE);
    zoneFeatureCache.set(exactKey, result);

    return result;
}

function getStationRouteColors(
    routeIds: string[],
    routeColorById: Map<string, string>,
    fallbackColor: string,
): string[] {
    return [
        ...new Set(
            routeIds.map(
                (routeId) =>
                    routeColorById.get(routeId) ||
                    fallbackColor ||
                    STATION_FALLBACK_COLOR,
            ),
        ),
    ];
}
