import { difference, intersection, type Geom } from "polyclip-ts";
import type { GeoJsonFeatureCollection, Position } from "./geojsonTypes";

export const WORLD_MASK_RING: Position[] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
];

type PolygonFeatureCollection = {
    features: PolygonFeature[];
    type: "FeatureCollection";
};

type PolygonFeature = {
    geometry: {
        coordinates: unknown;
        type: "Polygon" | "MultiPolygon";
    };
};

export function buildPlayAreaMask(
    boundary: GeoJsonFeatureCollection,
): GeoJsonFeatureCollection {
    const holes = getExteriorRings(boundary).map(orientHoleRing);

    return {
        features: [
            {
                geometry: {
                    coordinates: [
                        orientExteriorRing(WORLD_MASK_RING),
                        ...holes,
                    ],
                    type: "Polygon",
                },
                properties: {},
                type: "Feature",
            },
        ],
        type: "FeatureCollection",
    };
}

export function buildCombinedInsideMask(
    playArea: PolygonFeatureCollection,
    ...cutouts: PolygonFeatureCollection[]
): GeoJsonFeatureCollection {
    const playAreaPolygons = getPolygons(playArea);

    if (playAreaPolygons.length === 0) {
        return { features: [], type: "FeatureCollection" };
    }

    const cutoutGeoms: Geom[] = [];
    for (const cutout of cutouts) {
        const polys = getPolygons(cutout);
        if (polys.length === 0) continue;
        cutoutGeoms.push(polys as Geom);
    }

    if (cutoutGeoms.length === 0) {
        return { features: [], type: "FeatureCollection" };
    }

    let brightArea: Geom;
    if (cutoutGeoms.length === 1) {
        brightArea = cutoutGeoms[0];
    } else {
        brightArea = intersection(cutoutGeoms[0], ...cutoutGeoms.slice(1));
    }

    const hasBrightArea = (brightArea as Position[][][]).some(
        (polygon) => Array.isArray(polygon) && polygon.length > 0,
    );

    if (!hasBrightArea) {
        return {
            features: [
                {
                    geometry: {
                        coordinates: playAreaPolygons,
                        type: "MultiPolygon" as const,
                    },
                    properties: {},
                    type: "Feature" as const,
                },
            ],
            type: "FeatureCollection",
        };
    }

    const maskedArea = difference(
        playAreaPolygons as Geom,
        brightArea,
    ) as Position[][][];

    return {
        features:
            maskedArea.length > 0
                ? [
                      {
                          geometry: {
                              coordinates: maskedArea,
                              type: "MultiPolygon" as const,
                          },
                          properties: {},
                          type: "Feature" as const,
                      },
                  ]
                : [],
        type: "FeatureCollection",
    };
}

export function asSeparateMaskConstraints(
    collection: PolygonFeatureCollection,
): PolygonFeatureCollection[] {
    return collection.features.map((feature) => ({
        features: [feature],
        type: "FeatureCollection",
    }));
}

function getExteriorRings(collection: PolygonFeatureCollection): Position[][] {
    return collection.features.flatMap((feature) => {
        const { coordinates, type } = feature.geometry;

        if (type === "Polygon") {
            const rings = Array.isArray(coordinates) ? coordinates : [];
            const exterior = toPositionRing(rings[0]);
            return exterior ? [exterior] : [];
        }

        const polygons = Array.isArray(coordinates) ? coordinates : [];
        return polygons.flatMap((polygon) => {
            const rings = Array.isArray(polygon) ? polygon : [];
            const exterior = toPositionRing(rings[0]);
            return exterior ? [exterior] : [];
        });
    });
}

function getPolygons(collection: PolygonFeatureCollection): Position[][][] {
    return collection.features.flatMap((feature) => {
        const { coordinates, type } = feature.geometry;

        if (type === "Polygon") {
            const polygon = toPolygon(coordinates);
            return polygon ? [polygon] : [];
        }

        const polygons = Array.isArray(coordinates) ? coordinates : [];
        return polygons.flatMap((polygon) => {
            const converted = toPolygon(polygon);
            return converted ? [converted] : [];
        });
    });
}

function toPolygon(value: unknown): Position[][] | null {
    if (!Array.isArray(value)) return null;

    const rings = value.flatMap((ring) => {
        const positions = toPositionRing(ring);
        return positions ? [positions] : [];
    });

    return rings.length > 0 ? rings : null;
}

function toPositionRing(value: unknown): Position[] | null {
    if (!Array.isArray(value)) return null;

    const ring = value.flatMap((point) => {
        if (
            Array.isArray(point) &&
            typeof point[0] === "number" &&
            typeof point[1] === "number"
        ) {
            return [[point[0], point[1]] as Position];
        }
        return [];
    });

    return ring.length > 0 ? ring : null;
}

function orientExteriorRing(ring: Position[]): Position[] {
    return signedRingArea(ring) >= 0 ? ring : [...ring].reverse();
}

function orientHoleRing(ring: Position[]): Position[] {
    return signedRingArea(ring) <= 0 ? ring : [...ring].reverse();
}

export function signedRingArea(ring: Position[]): number {
    let area = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
        const [x1, y1] = ring[index];
        const [x2, y2] = ring[index + 1];
        area += x1 * y2 - x2 * y1;
    }
    return area / 2;
}
