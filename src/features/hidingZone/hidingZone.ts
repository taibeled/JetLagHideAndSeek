import circle from "@turf/circle";
import { featureCollection } from "@turf/helpers";
import union from "@turf/union";

import type { Bbox } from "@/features/map/geojsonTypes";

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

const METERS_PER_MILE = 1609.344;
const STATION_FALLBACK_COLOR = "#1f6f78";

export function bboxIntersects(a: Bbox, b: Bbox): boolean {
    const [aWest, aSouth, aEast, aNorth] = a;
    const [bWest, bSouth, bEast, bNorth] = b;
    return !(
        aEast < bWest ||
        bEast < aWest ||
        aNorth < bSouth ||
        bNorth < aSouth
    );
}

export function getSuggestedPresetIds(
    presets: HidingZonePreset[],
    playAreaBbox: Bbox,
): string[] {
    return presets
        .filter((preset) => bboxIntersects(preset.bbox, playAreaBbox))
        .map((preset) => preset.id);
}

export function toMeters(value: string, unit: HidingZoneUnit): number | null {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null;

    if (unit === "km") return numericValue * 1000;
    if (unit === "mi") return numericValue * METERS_PER_MILE;
    return numericValue;
}

export function fromMeters(meters: number, unit: HidingZoneUnit): string {
    const value =
        unit === "km"
            ? meters / 1000
            : unit === "mi"
              ? meters / METERS_PER_MILE
              : meters;
    return formatRadiusValue(value);
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
            const existing = stations.get(station.id);
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
            } else {
                stations.set(station.id, {
                    ...station,
                    routeColors,
                    routeIds: [...station.routeIds].sort(),
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

export function buildHidingZoneFeatureCollection(
    stations: TransitStation[],
    radiusMeters: number,
): ZoneFeatureCollection {
    if (stations.length === 0) {
        return { features: [], type: "FeatureCollection" };
    }

    const circles = stations.map((station) =>
        circle([station.lon, station.lat], radiusMeters / 1000, {
            properties: { radiusMeters },
            steps: 48,
            units: "kilometers",
        }),
    );

    if (circles.length === 1) {
        return {
            features: [circles[0]],
            type: "FeatureCollection",
        };
    }

    const merged = union(featureCollection(circles), {
        properties: { radiusMeters },
    }) as ZoneFeature | null;

    return {
        features: merged ? [merged] : [],
        type: "FeatureCollection",
    };
}

function formatRadiusValue(value: number): string {
    if (Math.abs(value - Math.round(value)) < 0.000001) {
        return String(Math.round(value));
    }
    if (value >= 10) return value.toFixed(1);
    return value.toFixed(2);
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
