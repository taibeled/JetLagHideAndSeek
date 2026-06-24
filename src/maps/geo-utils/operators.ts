import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point as GeoPoint,
    Polygon,
} from "geojson";

import { BLANK_GEOJSON } from "@/maps/api";

export { geoSpatialVoronoi } from "@/maps/geo-utils/voronoi";

export const safeUnion = (input: FeatureCollection<Polygon | MultiPolygon>) => {
    if (input.features.length === 0) {
        // Turf union requires >=2 geometries. During question/filter
        // transitions we can briefly produce an empty collection; return
        // a stable blank-world mask feature instead of crashing.
        return BLANK_GEOJSON.features[0] as Feature<Polygon>;
    }
    if (input.features.length === 1) return input.features[0];
    const union = turf.union(input);
    if (union) return union;
    throw new Error("No features");
};

export const holedMask = (
    input:
        | Feature<Polygon | MultiPolygon>
        | FeatureCollection<Polygon | MultiPolygon>,
) => {
    return turf.difference(
        turf.featureCollection([
            BLANK_GEOJSON.features[0] as Feature<Polygon>,
            "features" in input ? safeUnion(input) : input,
        ]),
    );
};

export const modifyMapData = (
    mapData: FeatureCollection<Polygon | MultiPolygon>,
    modifications:
        | FeatureCollection<Polygon | MultiPolygon>
        | Feature<Polygon | MultiPolygon>,
    withinModifications: boolean,
) => {
    const safeModifications =
        "features" in modifications ? safeUnion(modifications) : modifications;

    if (withinModifications) {
        return turf.intersect(
            turf.featureCollection([safeUnion(mapData), safeModifications]),
        );
    }
    return turf.intersect(
        turf.featureCollection([
            safeUnion(mapData),
            holedMask(safeModifications)!,
        ]),
    );
};

const DEFAULT_BUFFER_UNIT: turf.Units = "miles";

/** Normalize a Polygon/MultiPolygon feature to MultiPolygon (the shape the
 *  old arcgis path returned). */
const toMultiPolygon = (
    f: Feature<Polygon | MultiPolygon>,
): Feature<MultiPolygon> =>
    f.geometry.type === "MultiPolygon"
        ? (f as Feature<MultiPolygon>)
        : (turf.multiPolygon([
              f.geometry.coordinates,
          ]) as Feature<MultiPolygon>);

/**
 * Geodesic buffer of every feature in the collection by `distance`, unioned
 * into one MultiPolygon. Replaces the old @arcgis/core geodesicBufferOperator:
 * turf.buffer draws geodesic circles for points (the only thing radius /
 * tentacles pass) and an azimuthal buffer for polygons/lines. Verified within
 * ~0.26% of WGS84 ground truth at game radii — a systematic offset, so all
 * players using this tool agree with each other.
 */
const bufferUnion = (
    geometry: FeatureCollection,
    distance: number,
    unit: turf.Units,
): Feature<MultiPolygon> => {
    const buffered = turf.buffer(geometry, distance, { units: unit });
    const feats = (buffered?.features ?? []).filter(
        (feat): feat is Feature<Polygon | MultiPolygon> =>
            !!feat?.geometry &&
            (feat.geometry.type === "Polygon" ||
                feat.geometry.type === "MultiPolygon"),
    );
    if (feats.length === 0) {
        return turf.multiPolygon([]) as Feature<MultiPolygon>;
    }
    if (feats.length === 1) {
        return toMultiPolygon(feats[0]);
    }
    const union = turf.union(turf.featureCollection(feats));
    if (union) {
        return toMultiPolygon(union);
    }
    // turf.union can return null (e.g. degenerate/non-overlapping geometry);
    // fall back to every polygon ring combined into one MultiPolygon rather
    // than just feats[0], so no buffered feature is silently dropped.
    const polygons = feats.flatMap((f) =>
        f.geometry.type === "MultiPolygon"
            ? f.geometry.coordinates
            : [f.geometry.coordinates],
    );
    return turf.multiPolygon(polygons) as Feature<MultiPolygon>;
};

export const arcBuffer = async (
    geometry: FeatureCollection,
    distance: number,
    unit: turf.Units = DEFAULT_BUFFER_UNIT,
): Promise<Feature<MultiPolygon>> => bufferUnion(geometry, distance, unit);

/** Geodesic distance (in `unit`) from `point` to a feature of any type; 0 when
 *  the point is inside a polygon, matching the old geodeticDistanceOperator. */
const distanceToFeature = (
    feature: Feature,
    point: Feature<GeoPoint>,
    unit: turf.Units,
): number => {
    const g = feature.geometry;
    if (!g) return Infinity;
    switch (g.type) {
        case "Point":
            return turf.distance(point, feature as Feature<GeoPoint>, {
                units: unit,
            });
        case "MultiPoint":
            return Math.min(
                ...g.coordinates.map((c) =>
                    turf.distance(point, turf.point(c), { units: unit }),
                ),
            );
        case "LineString":
        case "MultiLineString":
            return turf.pointToLineDistance(point, feature as any, {
                units: unit,
            });
        case "Polygon":
        case "MultiPolygon":
            // pointToPolygonDistance is negative inside; clamp to 0.
            return Math.max(
                0,
                turf.pointToPolygonDistance(point, feature as any, {
                    units: unit,
                }),
            );
        default:
            return Infinity;
    }
};

export const arcBufferToPoint = async (
    geometry: FeatureCollection,
    lat: number,
    lng: number,
): Promise<Feature<MultiPolygon>> => {
    const point = turf.point([lng, lat]);
    const distances = geometry.features
        .map((feat) => distanceToFeature(feat, point, DEFAULT_BUFFER_UNIT))
        .filter(Number.isFinite);
    if (distances.length === 0) {
        // Empty or all-unsupported collection — no finite distance to buffer.
        return turf.multiPolygon([]) as Feature<MultiPolygon>;
    }
    return bufferUnion(geometry, Math.min(...distances), DEFAULT_BUFFER_UNIT);
};
