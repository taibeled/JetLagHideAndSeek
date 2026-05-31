import { difference, intersection, union, type Geom } from "polyclip-ts";
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
    return buildCombinedEligibilityMask(playArea, cutouts);
}

const MAX_MASK_CACHE_SIZE = 40;
const maskResultCache = new Map<string, GeoJsonFeatureCollection>();

/**
 * Build a cache key from the structure and a lightweight coordinate
 * fingerprint of each input. We sample the first ring of each feature so
 * that geometrically different inputs produce different keys.
 */
function maskCacheKey(
    playArea: PolygonFeatureCollection,
    requiredConstraints: PolygonFeatureCollection[],
    excludedAreas: PolygonFeatureCollection[],
): string {
    const collections = [playArea, ...requiredConstraints, ...excludedAreas];
    const parts = collections.map((c) =>
        c.features
            .map((f) => {
                const coords = (f.geometry as { coordinates?: unknown })
                    .coordinates;
                const ring0 = Array.isArray(coords) ? coords[0] : undefined;
                const firstCoord = Array.isArray(ring0) ? ring0[0] : undefined;
                const hash =
                    firstCoord &&
                    Array.isArray(firstCoord) &&
                    typeof firstCoord[0] === "number"
                        ? `${firstCoord[0].toFixed(3)},${firstCoord[1]?.toFixed(3) ?? 0}`
                        : "?";
                return `${f.geometry.type}:${f.geometry.coordinates ? "hasCoords" : "none"}:${hash}`;
            })
            .join("|"),
    );
    return parts.join("||");
}

export function buildCombinedEligibilityMask(
    playArea: PolygonFeatureCollection,
    requiredConstraints: PolygonFeatureCollection[],
    excludedAreas: PolygonFeatureCollection[] = [],
): GeoJsonFeatureCollection {
    const cacheKey = maskCacheKey(
        playArea,
        requiredConstraints,
        excludedAreas,
    );
    const cached = maskResultCache.get(cacheKey);
    if (cached) return cached;

    const playAreaPolygons = getPolygons(playArea);

    if (playAreaPolygons.length === 0) {
        return { features: [], type: "FeatureCollection" };
    }

    const requiredGeoms = getGeoms(requiredConstraints);
    const excludedGeoms = getGeoms(excludedAreas);

    if (requiredGeoms.length === 0 && excludedGeoms.length === 0) {
        return { features: [], type: "FeatureCollection" };
    }

    let eligibleArea: Geom;
    if (requiredGeoms.length === 0) {
        eligibleArea = playAreaPolygons as Geom;
    } else if (requiredGeoms.length === 1) {
        eligibleArea = requiredGeoms[0];
    } else {
        eligibleArea = intersection(
            requiredGeoms[0],
            ...requiredGeoms.slice(1),
        );
    }

    if (!hasGeomArea(eligibleArea)) {
        return buildMultiPolygonFeatureCollection(playAreaPolygons);
    }

    if (excludedGeoms.length > 0) {
        const excludedArea =
            excludedGeoms.length === 1
                ? excludedGeoms[0]
                : union(excludedGeoms[0], ...excludedGeoms.slice(1));

        if (hasGeomArea(excludedArea)) {
            eligibleArea = difference(eligibleArea, excludedArea) as Geom;
        }
    }

    if (!hasGeomArea(eligibleArea)) {
        return buildMultiPolygonFeatureCollection(playAreaPolygons);
    }

    const maskedArea = difference(
        playAreaPolygons as Geom,
        eligibleArea,
    ) as Position[][][];

    const result = buildMultiPolygonFeatureCollection(maskedArea);

    // Evict oldest entry when cache exceeds max size.
    if (maskResultCache.size >= MAX_MASK_CACHE_SIZE) {
        const oldest = maskResultCache.keys().next().value;
        if (oldest !== undefined) maskResultCache.delete(oldest);
    }
    maskResultCache.set(cacheKey, result);

    return result;
}

function getGeoms(collections: PolygonFeatureCollection[]): Geom[] {
    const geoms: Geom[] = [];
    for (const collection of collections) {
        const polygons = getPolygons(collection);
        if (polygons.length > 0) {
            geoms.push(polygons as Geom);
        }
    }
    return geoms;
}

function hasGeomArea(geom: Geom): boolean {
    return (geom as Position[][][]).some(
        (polygon) => Array.isArray(polygon) && polygon.length > 0,
    );
}

function buildMultiPolygonFeatureCollection(
    polygons: Position[][][],
): GeoJsonFeatureCollection {
    return {
        features:
            polygons.length > 0
                ? [
                      {
                          geometry: {
                              coordinates: polygons,
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
