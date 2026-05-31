import { bboxIntersects } from "@/shared/geojson";
import {
    buildHidingZoneFeatureCollection,
    buildRouteFeatureCollection,
    buildStationFeatureCollection,
    getSelectedRoutes,
    getSelectedStations,
    getSuggestedPresetIds,
} from "../hidingZone";
import type { HidingZonePreset } from "../hidingZoneTypes";

const EARTH_RADIUS_METERS = 6371008.8;

const preset: HidingZonePreset = {
    bbox: [139.6, 35.6, 139.8, 35.8],
    defaultColor: "#009BBF",
    id: "tokyo-metro",
    label: "Tokyo Metro",
    operator: "TokyoMetro",
    routes: [
        {
            color: "#FF9500",
            geometry: {
                coordinates: [
                    [
                        [139.76, 35.68],
                        [139.77, 35.69],
                    ],
                ],
                type: "MultiLineString",
            },
            id: "gtfs:test:route:route-a",
            name: "Route A",
            sourceId: "route-a",
        },
    ],
    source: { kind: "gtfs", namespace: "test" },
    stations: [
        {
            id: "gtfs:test:stop:station-a",
            lat: 35.68,
            lon: 139.76,
            mergeKey: "station-a-merge",
            name: "Station A",
            routeIds: ["gtfs:test:route:route-a"],
            sourceId: "station-a",
        },
    ],
};

function collectCoordinates(geometry: any): number[][] {
    if (geometry.type === "Polygon") {
        return geometry.coordinates.flat();
    }
    if (geometry.type === "MultiPolygon") {
        return geometry.coordinates.flat(2);
    }
    return [];
}

function projectedRingArea(
    coordinates: number[][],
    originLatitude: number,
): number {
    const originLatitudeRadians = (originLatitude * Math.PI) / 180;
    let area = 0;

    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const [lonA, latA] = coordinates[index];
        const [lonB, latB] = coordinates[index + 1];
        const xA =
            EARTH_RADIUS_METERS *
            ((lonA * Math.PI) / 180) *
            Math.cos(originLatitudeRadians);
        const yA = EARTH_RADIUS_METERS * ((latA * Math.PI) / 180);
        const xB =
            EARTH_RADIUS_METERS *
            ((lonB * Math.PI) / 180) *
            Math.cos(originLatitudeRadians);
        const yB = EARTH_RADIUS_METERS * ((latB * Math.PI) / 180);

        area += xA * yB - xB * yA;
    }

    return Math.abs(area) / 2;
}

function polygonAreaMeters(feature: any, originLatitude: number): number {
    if (feature.geometry.type === "Polygon") {
        const [outerRing, ...holes] = feature.geometry.coordinates;
        return (
            projectedRingArea(outerRing, originLatitude) -
            holes.reduce(
                (area: number, ring: number[][]) =>
                    area + projectedRingArea(ring, originLatitude),
                0,
            )
        );
    }

    if (feature.geometry.type === "MultiPolygon") {
        return feature.geometry.coordinates.reduce(
            (area: number, polygon: number[][][]) =>
                area +
                polygonAreaMeters(
                    {
                        geometry: {
                            coordinates: polygon,
                            type: "Polygon",
                        },
                    },
                    originLatitude,
                ),
            0,
        );
    }

    return 0;
}

describe("hidingZone helpers", () => {
    it("detects bbox intersections", () => {
        expect(bboxIntersects([0, 0, 2, 2], [1, 1, 3, 3])).toBe(true);
        expect(bboxIntersects([0, 0, 2, 2], [3, 3, 4, 4])).toBe(false);
    });

    it("suggests presets when their bbox intersects the play area bbox", () => {
        expect(getSuggestedPresetIds([preset], [139.7, 35.7, 140, 36])).toEqual(
            ["tokyo-metro"],
        );
        expect(getSuggestedPresetIds([preset], [140, 36, 141, 37])).toEqual([]);
    });

    it("deduplicates selected station contributions by merge key", () => {
        const duplicatePreset: HidingZonePreset = {
            ...preset,
            id: "toei-subway",
            stations: [
                {
                    ...preset.stations[0],
                    id: "gtfs:toei:stop:station-b",
                    routeIds: ["gtfs:toei:route:route-b"],
                    sourceId: "station-b",
                },
            ],
        };

        expect(getSelectedStations([preset, duplicatePreset])).toEqual([
            {
                id: "station-a-merge",
                lat: 35.68,
                lon: 139.76,
                name: "Station A",
                routeColors: ["#FF9500", "#009BBF"],
                routeIds: [
                    "gtfs:test:route:route-a",
                    "gtfs:toei:route:route-b",
                ],
                sourceStationIds: [
                    "gtfs:test:stop:station-a",
                    "gtfs:toei:stop:station-b",
                ],
            },
        ]);
    });

    it("keeps source-adapter route ids distinct", () => {
        const collidingPreset: HidingZonePreset = {
            ...preset,
            id: "toei-subway",
            routes: [
                {
                    ...preset.routes[0],
                    color: "#6CBB5A",
                    id: "gtfs:toei:route:route-a",
                    name: "Different Route A",
                },
            ],
            source: { kind: "gtfs", namespace: "toei" },
            stations: [
                {
                    id: "gtfs:toei:stop:station-b",
                    lat: 35.69,
                    lon: 139.77,
                    mergeKey: "station-b-merge",
                    name: "Station B",
                    routeIds: ["gtfs:toei:route:route-a"],
                    sourceId: "station-b",
                },
            ],
        };

        expect(
            getSelectedRoutes([preset, collidingPreset]).map((route) => ({
                id: route.id,
                name: route.name,
            })),
        ).toEqual([
            { id: "gtfs:test:route:route-a", name: "Route A" },
            { id: "gtfs:toei:route:route-a", name: "Different Route A" },
        ]);
        expect(
            getSelectedStations([preset, collidingPreset]).map((station) => ({
                id: station.id,
                routeIds: station.routeIds,
            })),
        ).toEqual([
            {
                id: "station-a-merge",
                routeIds: ["gtfs:test:route:route-a"],
            },
            {
                id: "station-b-merge",
                routeIds: ["gtfs:toei:route:route-a"],
            },
        ]);
    });

    it("preserves route colors and falls back only when a route color is absent", () => {
        const presetWithFallbackRoute: HidingZonePreset = {
            ...preset,
            routes: [
                ...preset.routes,
                {
                    color: "",
                    geometry: {
                        coordinates: [
                            [
                                [139.75, 35.67],
                                [139.78, 35.7],
                            ],
                        ],
                        type: "MultiLineString",
                    },
                    id: "gtfs:test:route:route-fallback",
                    name: "Fallback Route",
                    sourceId: "route-fallback",
                },
            ],
        };

        const routeFeatures = buildRouteFeatureCollection([
            presetWithFallbackRoute,
        ]);

        expect(routeFeatures.features).toHaveLength(2);
        expect(routeFeatures.features[0].properties.color).toBe("#FF9500");
        expect(routeFeatures.features[0].properties.id).toBe(
            "gtfs:test:route:route-a",
        );
        expect(routeFeatures.features[1].properties.color).toBe(
            preset.defaultColor,
        );
    });

    it("expands station features into route-colored rings", () => {
        const stationFeatures = buildStationFeatureCollection([
            {
                id: "station-a",
                lat: 35.68,
                lon: 139.76,
                name: "Station A",
                routeColors: ["#FF9500", "#F62E36"],
                routeIds: ["route-a", "route-b"],
            },
        ]);

        expect(stationFeatures.features).toHaveLength(2);
        expect(
            stationFeatures.features.map((feature) => feature.properties),
        ).toEqual([
            {
                color: "#FF9500",
                id: "station-a",
                name: "Station A",
                ringCount: 2,
                ringIndex: 0,
            },
            {
                color: "#F62E36",
                id: "station-a",
                name: "Station A",
                ringCount: 2,
                ringIndex: 1,
            },
        ]);
    });

    it("builds empty hiding-zone feature collections", () => {
        expect(buildHidingZoneFeatureCollection([], 600).features).toEqual([]);
    });

    it("builds a finite polygon around a selected station", () => {
        const zone = buildHidingZoneFeatureCollection(preset.stations, 600);
        const feature = zone.features[0];
        const coordinates = collectCoordinates(feature.geometry);
        const lons = coordinates.map(([lon]) => lon);
        const lats = coordinates.map(([, lat]) => lat);
        const area = polygonAreaMeters(feature, preset.stations[0].lat);
        const expectedArea = Math.PI * 600 * 600;

        expect(zone.features).toHaveLength(1);
        expect(feature.geometry.type).toBe("Polygon");
        expect(feature.properties.radiusMeters).toBe(600);
        expect(coordinates.length).toBeGreaterThan(4);
        expect(
            coordinates.every(([lon, lat]) =>
                [lon, lat].every(Number.isFinite),
            ),
        ).toBe(true);
        expect(Math.min(...lons)).toBeLessThan(preset.stations[0].lon);
        expect(Math.max(...lons)).toBeGreaterThan(preset.stations[0].lon);
        expect(Math.min(...lats)).toBeLessThan(preset.stations[0].lat);
        expect(Math.max(...lats)).toBeGreaterThan(preset.stations[0].lat);
        expect(area).toBeGreaterThan(expectedArea * 0.85);
        expect(area).toBeLessThan(expectedArea * 1.15);
    });

    it("merges multiple station buffers and grows when radius increases", () => {
        const nearbyStations = [
            preset.stations[0],
            {
                id: "station-b",
                lat: 35.681,
                lon: 139.766,
                name: "Station B",
                routeIds: ["route-b"],
            },
        ];

        const zone600 = buildHidingZoneFeatureCollection(nearbyStations, 600);
        const zone1000 = buildHidingZoneFeatureCollection(nearbyStations, 1000);
        const feature600 = zone600.features[0];
        const feature1000 = zone1000.features[0];

        expect(zone600.features).toHaveLength(1);
        expect(["Polygon", "MultiPolygon"]).toContain(feature600.geometry.type);
        expect(feature600.properties.radiusMeters).toBe(600);
        expect(feature1000.properties.radiusMeters).toBe(1000);
        expect(
            polygonAreaMeters(feature1000, nearbyStations[0].lat),
        ).toBeGreaterThan(polygonAreaMeters(feature600, nearbyStations[0].lat));
    });
});
