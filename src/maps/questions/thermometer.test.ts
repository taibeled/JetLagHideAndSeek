import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hiderMode } from "@/lib/context";
import { geoSpatialVoronoi } from "@/maps/geo-utils/voronoi";

import {
    adjustPerThermometer,
    hiderifyThermometer,
    thermometerPlanningPolygon,
} from "./thermometer";

vi.mock("@/maps/geo-utils/voronoi", () => ({
    geoSpatialVoronoi: vi.fn(),
}));

afterEach(() => {
    hiderMode.set(false);
    vi.clearAllMocks();
});

const mockVoronoiCells = (): FeatureCollection<Polygon | MultiPolygon> => ({
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [0, 0],
                        [1, 0],
                        [1, 1],
                        [0, 1],
                        [0, 0],
                    ],
                ],
            },
            properties: {},
        } as Feature<Polygon>,
        {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [2, 0],
                        [3, 0],
                        [3, 1],
                        [2, 1],
                        [2, 0],
                    ],
                ],
            },
            properties: {},
        } as Feature<Polygon>,
    ],
});

describe("adjustPerThermometer", () => {
    it("intersects map data with the warmer Voronoi cell (cell 1) when warmer is true", () => {
        const question: any = {
            latA: 0.5,
            lngA: 0.5,
            latB: 0.5,
            lngB: 2.5,
            warmer: true,
            drag: true,
            colorA: "red",
            colorB: "blue",
            collapsed: false,
        };
        const mapData = turf.featureCollection([
            turf.polygon([
                [
                    [0, 0],
                    [3, 0],
                    [3, 1],
                    [0, 1],
                    [0, 0],
                ],
            ]),
        ]);
        (geoSpatialVoronoi as any).mockReturnValue(mockVoronoiCells());

        const result = adjustPerThermometer(question, mapData);

        expect(result).toBeDefined();
        expect(result!.geometry!.type).toBe("Polygon");
        const coords = (result!.geometry as Polygon).coordinates[0];
        expect(coords.length).toBeGreaterThanOrEqual(4);
        expect(coords.every((c: number[]) => c[0] >= 1.9)).toBe(true);
    });

    it("intersects map data with the colder Voronoi cell (cell 0) when warmer is false", () => {
        const question: any = {
            latA: 0.5,
            lngA: 0.5,
            latB: 0.5,
            lngB: 2.5,
            warmer: false,
        };
        const mapData = turf.featureCollection([
            turf.polygon([
                [
                    [0, 0],
                    [3, 0],
                    [3, 1],
                    [0, 1],
                    [0, 0],
                ],
            ]),
        ]);
        (geoSpatialVoronoi as any).mockReturnValue(mockVoronoiCells());

        const result = adjustPerThermometer(question, mapData);

        expect(result).toBeDefined();
        expect(result!.geometry!.type).toBe("Polygon");
        const coords = (result!.geometry as Polygon).coordinates[0];
        expect(coords.length).toBeGreaterThanOrEqual(4);
        expect(coords.every((c: number[]) => c[0] <= 1.1)).toBe(true);
    });

    it("returns undefined when mapData is null", () => {
        const question: any = {
            latA: 0.5,
            lngA: 0.5,
            latB: 0.5,
            lngB: 2.5,
            warmer: true,
        };

        const result = adjustPerThermometer(question, null);

        expect(result).toBeUndefined();
    });
});

describe("hiderifyThermometer", () => {
    it("sets warmer = true when hider is in point B's Voronoi region (cell 1)", () => {
        const question: any = {
            latA: 0.5,
            lngA: 0.5,
            latB: 0.5,
            lngB: 2.5,
            warmer: undefined,
        };
        (geoSpatialVoronoi as any).mockReturnValue(mockVoronoiCells());
        hiderMode.set({ latitude: 0.5, longitude: 2.5 });

        const result = hiderifyThermometer(question);

        expect(result.warmer).toBe(true);
    });

    it("sets warmer = false when hider is in point A's Voronoi region (cell 0)", () => {
        const question: any = {
            latA: 0.5,
            lngA: 0.5,
            latB: 0.5,
            lngB: 2.5,
            warmer: undefined,
        };
        (geoSpatialVoronoi as any).mockReturnValue(mockVoronoiCells());
        hiderMode.set({ latitude: 0.5, longitude: 0.5 });

        const result = hiderifyThermometer(question);

        expect(result.warmer).toBe(false);
    });

    it("returns question unchanged when hiderMode is false", () => {
        const question: any = {
            latA: 0.5,
            lngA: 0.5,
            latB: 0.5,
            lngB: 2.5,
            warmer: true,
        };
        hiderMode.set(false);

        const result = hiderifyThermometer(question);

        expect(result).toBe(question);
        expect(result.warmer).toBe(true);
    });
});

describe("thermometerPlanningPolygon", () => {
    it("returns Voronoi boundary line features", () => {
        const question: any = {
            latA: 0.5,
            lngA: 0.5,
            latB: 0.5,
            lngB: 2.5,
        };
        (geoSpatialVoronoi as any).mockReturnValue(mockVoronoiCells());

        const result = thermometerPlanningPolygon(question);

        expect(result.type).toBe("FeatureCollection");
        expect(result.features.length).toBeGreaterThan(0);
        result.features.forEach((f: any) => {
            expect(f.type).toBe("Feature");
            const geomType = f.geometry?.type;
            expect(["LineString", "MultiLineString"]).toContain(geomType);
        });
    });
});
