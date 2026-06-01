import circle from "@turf/circle";
import { featureCollection } from "@turf/helpers";
import union from "@turf/union";

import { bboxIntersects, type Bbox } from "@/shared/geojson";
import {
    fromMeters as fromDistanceMeters,
    toMeters as toDistanceMeters,
} from "@/shared/distanceUnits";

import type {
    HidingZonePreset,
    HidingZoneUnit,
    RouteFeatureCollection,
    StationFeatureCollection,
    TransitRoute,
    TransitStation,
    ZoneFeatureCollection,
    ZoneFeature,
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

export function clearHidingZoneFeatureCache() {
    zoneFeatureCache.clear();
}

function zoneCacheKey(
    stations: TransitStation[],
    radiusMeters: number,
): string {
    const keys = stations
        .map((station) => `${station.id}@${station.lon},${station.lat}`)
        .sort()
        .join(",");
    return `${keys}|${radiusMeters}`;
}

export function buildHidingZoneFeatureCollection(
    stations: TransitStation[],
    radiusMeters: number,
): ZoneFeatureCollection {
    if (stations.length === 0) {
        return { features: [], type: "FeatureCollection" };
    }

    const cacheKey = zoneCacheKey(stations, radiusMeters);
    const cached = zoneFeatureCache.get(cacheKey);
    if (cached) {
        zoneFeatureCache.delete(cacheKey);
        zoneFeatureCache.set(cacheKey, cached);
        return cached;
    }

    const circles = stations.map((station) =>
        circle([station.lon, station.lat], radiusMeters / 1000, {
            properties: { radiusMeters },
            steps: 48,
            units: "kilometers",
        }),
    );

    let result: ZoneFeatureCollection;

    if (circles.length === 1) {
        result = {
            features: [circles[0]],
            type: "FeatureCollection",
        };
    } else {
        const merged = union(featureCollection(circles), {
            properties: { radiusMeters },
        }) as ZoneFeature | null;

        result = {
            features: merged ? [merged] : [],
            type: "FeatureCollection",
        };
    }

    if (zoneFeatureCache.size >= MAX_ZONE_CACHE_SIZE) {
        const oldest = zoneFeatureCache.keys().next().value;
        if (oldest !== undefined) zoneFeatureCache.delete(oldest);
    }
    zoneFeatureCache.set(cacheKey, result);

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
