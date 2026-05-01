import * as units from "@arcgis/core/core/units.js";
import * as geodesicBufferOperator from "@arcgis/core/geometry/operators/geodesicBufferOperator.js";
import * as geodeticDistanceOperator from "@arcgis/core/geometry/operators/geodeticDistanceOperator.js";
import Point from "@arcgis/core/geometry/Point.js";
import * as geometryJsonUtils from "@arcgis/core/geometry/support/jsonUtils.js";
import * as unionTypes from "@arcgis/core/unionTypes.js";
import { arcgisToGeoJSON, geojsonToArcGIS } from "@terraformer/arcgis";
import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    GeoJSON,
    MultiPolygon,
    Polygon,
} from "geojson";

import { BLANK_GEOJSON } from "@/maps/api";
import { dedupePolygonFeatureVertices } from "@/maps/geo-utils/polygon-ring-dedupe";

export {
    clippedVoronoiCells,
    finalizePolygonForLeaflet,
    geoSpatialVoronoi,
    repairIntersectedCell,
    VORONOI_POINT_CAP,
} from "@/maps/geo-utils/voronoi";

/** Turf booleans often emit consecutive duplicate ring vertices; Leaflet GeoJSON throws on those. */
function stripDuplicateVerticesFromPolygonFeature(
    feature: Feature<Polygon | MultiPolygon>,
): Feature<Polygon | MultiPolygon> {
    let base: Feature<Polygon | MultiPolygon>;
    try {
        base = turf.cleanCoords(feature, {
            mutate: false,
        }) as Feature<Polygon | MultiPolygon>;
    } catch {
        base = dedupePolygonFeatureVertices(feature);
        try {
            base = turf.cleanCoords(base, {
                mutate: false,
            }) as Feature<Polygon | MultiPolygon>;
        } catch {
            /* keep manually deduped rings */
        }
    }
    /* `cleanCoords` can still leave repeats that Leaflet rejects on projected boundaries / Voronoi. */
    return dedupePolygonFeatureVertices(base);
}

/** Walk GeoJSON and clean polygon coordinates before passing to `L.geoJSON`. */
export function sanitizeGeoJSONForLeaflet(
    input: GeoJSON | null | undefined,
): GeoJSON | null {
    if (!input) return null;
    if (input.type === "FeatureCollection") {
        return {
            type: "FeatureCollection",
            features: input.features.map((f) => {
                if (
                    f.geometry &&
                    (f.geometry.type === "Polygon" ||
                        f.geometry.type === "MultiPolygon")
                ) {
                    return stripDuplicateVerticesFromPolygonFeature(
                        f as Feature<Polygon | MultiPolygon>,
                    );
                }
                return f;
            }),
        };
    }
    if (input.type === "Feature") {
        const g = input.geometry;
        if (
            g &&
            (g.type === "Polygon" || g.type === "MultiPolygon")
        ) {
            return stripDuplicateVerticesFromPolygonFeature(
                input as Feature<Polygon | MultiPolygon>,
            );
        }
    }
    return input;
}

export const safeUnion = (
    input: FeatureCollection<Polygon | MultiPolygon>,
): Feature<Polygon | MultiPolygon> => {
    if (input.features.length === 1) {
        return stripDuplicateVerticesFromPolygonFeature(
            input.features[0] as Feature<Polygon | MultiPolygon>,
        );
    }
    const union = turf.union(input);
    if (union) {
        return stripDuplicateVerticesFromPolygonFeature(
            union as Feature<Polygon | MultiPolygon>,
        );
    }
    throw new Error("No features");
};

export const holedMask = (
    input:
        | Feature<Polygon | MultiPolygon>
        | FeatureCollection<Polygon | MultiPolygon>,
) => {
    const diff = turf.difference(
        turf.featureCollection([
            BLANK_GEOJSON.features[0] as Feature<Polygon>,
            "features" in input ? safeUnion(input) : input,
        ]),
    );
    if (!diff) return null;
    return stripDuplicateVerticesFromPolygonFeature(
        diff as Feature<Polygon | MultiPolygon>,
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

    const raw =
        withinModifications ?
            turf.intersect(
                turf.featureCollection([safeUnion(mapData), safeModifications]),
            )
        :   turf.intersect(
                turf.featureCollection([
                    safeUnion(mapData),
                    holedMask(safeModifications)!,
                ]),
            );
    if (!raw) return raw;
    return stripDuplicateVerticesFromPolygonFeature(
        raw as Feature<Polygon | MultiPolygon>,
    );
};

const DEFAULT_BUFFER_UNIT = "miles";

export const arcBuffer = (
    geometry: FeatureCollection,
    distance: number,
    unit: units.LengthUnit & turf.Units = DEFAULT_BUFFER_UNIT,
) => {
    const arcgisGeometry = geometry.features.map((x) =>
        geometryJsonUtils.fromJSON(geojsonToArcGIS(x.geometry)),
    ) as unionTypes.GeometryUnion[];

    return innateArcBuffer(arcgisGeometry, distance, unit);
};

const innateArcBuffer = async (
    arcgisGeometry: unionTypes.GeometryUnion[],
    distance: number,
    unit: units.LengthUnit & turf.Units = DEFAULT_BUFFER_UNIT,
) => {
    await geodesicBufferOperator.load();

    const bufferedGeometry = geodesicBufferOperator.executeMany(
        arcgisGeometry,
        Array(arcgisGeometry.length).fill(distance),
        {
            union: true,
            unit: unit,
            maxDeviation: turf.convertLength(3, "feet", unit),
        },
    );

    return turf.combine(
        turf.featureCollection([
            turf.feature(arcgisToGeoJSON(bufferedGeometry[0] as any)),
        ]) as any,
    ).features[0] as Feature<MultiPolygon>;
};

export const arcBufferToPoint = async (
    geometry: FeatureCollection,
    lat: number,
    lng: number,
) => {
    const point = new Point({
        latitude: lat,
        longitude: lng,
    });

    const arcgisGeometry = geometry.features.map((x) =>
        geometryJsonUtils.fromJSON(geojsonToArcGIS(x.geometry)),
    ) as unionTypes.GeometryUnion[];

    await geodeticDistanceOperator.load();

    const distances = arcgisGeometry.map((x) =>
        geodeticDistanceOperator.execute(x, point, {
            unit: DEFAULT_BUFFER_UNIT,
        }),
    );

    return innateArcBuffer(arcgisGeometry, Math.min(...distances));
};
