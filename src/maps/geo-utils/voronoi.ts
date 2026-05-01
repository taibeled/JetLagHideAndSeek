import * as turf from "@turf/turf";
import { geoMercator } from "d3-geo";
// @ts-expect-error No type declaration
import { geoProject, geoStitch } from "d3-geo-projection";
// @ts-expect-error No type declaration
import { geoVoronoi } from "d3-geo-voronoi";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";

import { dedupePolygonFeatureVertices } from "@/maps/geo-utils/polygon-ring-dedupe";

const scaleReference = turf.toMercator(turf.point([180, 90])); // I thought this would yield the same as turf.earthRadius * Math.pi, but it's slightly larger

/** Degenerate polygons after cleaning — ignore */
const MIN_AREA_SQ_DEG = 1e-24;

export const geoSpatialVoronoi = (
    points: FeatureCollection<Point>,
): FeatureCollection<Polygon | MultiPolygon> => {
    const voronoi = geoVoronoi()(points).polygons();
    const projected = geoProject(
        geoStitch(voronoi),
        geoMercator().translate([0, 0]).precision(0.005),
    );

    const ratio = scaleReference.geometry.coordinates[0] / 480.5; // 961 is the default scale for some reason

    turf.coordEach(projected, (coord) => {
        coord[0] = coord[0] * ratio;
        coord[1] = coord[1] * -ratio; // y-coordinates are flipped
    });

    return turf.toWgs84(projected);
};

/** Skip Voronoi for huge candidate sets — d3 projection + per-cell intersect chokes the main thread. */
export const VORONOI_POINT_CAP = 500;

/**
 * Strip duplicate consecutive vertices from rings (and related junk). Turf `intersect` / `union`
 * and projected Voronoi edges can emit repeats that **Leaflet GeoJSON throws** on:
 * "The input polygon may not have duplicate vertices …".
 */
function stripDuplicateVertices(
    feature: Feature<Polygon | MultiPolygon>,
): Feature<Polygon | MultiPolygon> | null {
    try {
        return turf.cleanCoords(feature, {
            mutate: false,
        }) as Feature<Polygon | MultiPolygon>;
    } catch {
        const manual = dedupePolygonFeatureVertices(feature);
        try {
            return turf.cleanCoords(manual, {
                mutate: false,
            }) as Feature<Polygon | MultiPolygon>;
        } catch {
            return manual;
        }
    }
}

/** Best-effort ring cleanup before boolean ops; avoids turf.intersect throwing on duplicate vertices. */
function cleanPolygonFeatureForBoolean(
    feature: Feature<Polygon | MultiPolygon>,
): Feature<Polygon | MultiPolygon> {
    try {
        return turf.cleanCoords(feature, {
            mutate: false,
        }) as Feature<Polygon | MultiPolygon>;
    } catch {
        return feature;
    }
}

/**
 * Some polygon-clipping outputs still fail turf.booleanPointInPolygon even after coord cleaning.
 * Probe with a point on feature and drop cells that still throw to avoid crashing map overlays.
 */
function isSafeForPointInPolygon(
    feature: Feature<Polygon | MultiPolygon>,
): boolean {
    try {
        const probe = turf.pointOnFeature(feature);
        turf.booleanPointInPolygon(
            probe,
            feature as Feature<Polygon | MultiPolygon>,
        );
        return true;
    } catch {
        return false;
    }
}

/** Last pass before handing geometry to Leaflet: clean rings + drop empty / collapsed polygons. */
export function finalizePolygonForLeaflet(
    feature: Feature<Polygon | MultiPolygon> | null | undefined,
): Feature<Polygon | MultiPolygon> | null {
    if (!feature?.geometry) return null;
    const stripped = stripDuplicateVertices(feature);
    if (!stripped?.geometry) return null;
    const forLeaflet = dedupePolygonFeatureVertices(stripped);
    try {
        const a = turf.area(forLeaflet);
        if (!Number.isFinite(a) || a <= MIN_AREA_SQ_DEG) return null;
        return forLeaflet;
    } catch {
        return null;
    }
}

/**
 * Repair `turf.intersect` output so Leaflet / turf predicates never receive bow-ties or invalid rings.
 * Exported for tests; consumed by `clippedVoronoiCells`.
 */
export function repairIntersectedCell(
    feature: Feature<Polygon | MultiPolygon> | null | undefined,
): Feature<Polygon | MultiPolygon> | null {
    if (!feature?.geometry) return null;
    const props = { ...(feature.properties ?? {}) };

    const strippedIn =
        stripDuplicateVertices(
            turf.feature(feature.geometry, props) as Feature<
                Polygon | MultiPolygon
            >,
        ) ?? null;
    if (!strippedIn?.geometry) return null;

    const geom = turf.feature(strippedIn.geometry, props) as Feature<
        Polygon | MultiPolygon
    >;

    const hasKinks = turf.kinks(geom).features.length > 0;
    if (turf.booleanValid(geom) && !hasKinks) {
        return finalizePolygonForLeaflet(geom);
    }

    let unkinked:
        | FeatureCollection<Polygon | MultiPolygon>
        | { features: Feature<Polygon | MultiPolygon>[] };
    try {
        unkinked = turf.unkinkPolygon(geom);
    } catch {
        // `unkinkPolygon` rejects non-consecutive repeated vertices in a ring; drop unsafe cells.
        return finalizePolygonForLeaflet(geom);
    }
    const pieces = unkinked.features.filter(
        (f): f is Feature<Polygon | MultiPolygon> =>
            !!f.geometry &&
            (f.geometry.type === "Polygon" ||
                f.geometry.type === "MultiPolygon"),
    );
    if (pieces.length === 0) return null;

    let merged: Feature<Polygon | MultiPolygon> = turf.feature(
        pieces[0].geometry,
        props,
    ) as Feature<Polygon | MultiPolygon>;

    for (let i = 1; i < pieces.length; i++) {
        const u = turf.union(
            turf.featureCollection([
                merged,
                turf.feature(pieces[i].geometry, {}) as Feature<
                    Polygon | MultiPolygon
                >,
            ]),
        );
        if (!u) return null;
        merged = turf.feature(u.geometry, props) as Feature<
            Polygon | MultiPolygon
        >;
    }

    return finalizePolygonForLeaflet(merged);
}

/**
 * Voronoi cells over `points`, intersected with `clip` so cells stop at the play-zone boundary.
 * Call sites (`useMemo` in map overlays, map refresh in matching) scope recomputation; do not memoise here —
 * bbox-only keys wrongly reused geometry across distinct clips with identical extents.
 */
export function clippedVoronoiCells(
    points: FeatureCollection<Point>,
    clip: Feature<Polygon | MultiPolygon> | null,
): Feature<Polygon | MultiPolygon>[] {
    if (points.features.length < 2) return [];
    if (points.features.length > VORONOI_POINT_CAP) return [];

    const cells = geoSpatialVoronoi(points).features as Feature<
        Polygon | MultiPolygon
    >[];

    const finalizeAll = (
        list: (Feature<Polygon | MultiPolygon> | null)[],
    ): Feature<Polygon | MultiPolygon>[] =>
        list
            .map((c) => (c ? finalizePolygonForLeaflet(c) : null))
            .filter(
                (c): c is Feature<Polygon | MultiPolygon> =>
                    c !== null && isSafeForPointInPolygon(c),
            );

    if (!clip) {
        return finalizeAll(cells);
    }

    const clipForIntersect = cleanPolygonFeatureForBoolean(clip);

    return cells
        .map((cell) => {
            const cellForIntersect = cleanPolygonFeatureForBoolean(cell);
            let intersected: Feature<Polygon | MultiPolygon> | null = null;
            try {
                intersected = turf.intersect(
                    turf.featureCollection([
                        cellForIntersect,
                        clipForIntersect,
                    ]),
                ) as Feature<Polygon | MultiPolygon> | null;
            } catch {
                /* Projected Voronoi edges / OSM clip rings can still violate polygon-clipping input rules. */
                return null;
            }
            if (!intersected) return null;
            intersected.properties = {
                ...(intersected.properties ?? {}),
                ...(cell.properties ?? {}),
            };
            return repairIntersectedCell(
                intersected as Feature<Polygon | MultiPolygon>,
            );
        })
        .filter(
            (c): c is Feature<Polygon | MultiPolygon> =>
                c !== null && isSafeForPointInPolygon(c),
        );
}
