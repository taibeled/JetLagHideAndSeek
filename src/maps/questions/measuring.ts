import * as turf from "@turf/turf";
import type {
    BBox,
    Feature,
    FeatureCollection,
    LineString,
    MultiLineString,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import memoize from "lodash/memoize";
import uniqBy from "lodash/uniqBy";

import {
    hiderMode,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    trainStations,
} from "@/lib/context";
import {
    fetchCoastlinesForMeasuring,
    findPlacesInZone,
    findPlacesSpecificInZone,
    OVERPASS_MAJOR_CITY_FILTER,
    overpassAirportIataFilter,
    QuestionSpecificLocation,
} from "@/maps/api";
import osmtogeojson from "@/maps/api/osm-to-geojson";
import {
    arcBufferToPoint,
    connectToSeparateLines,
    groupObjects,
    modifyMapData,
} from "@/maps/geo-utils";
import {
    normalizedOsmRefs,
    playableTerritoryDigest,
} from "@/maps/questions/cache-key";
import {
    filterFacilityPointsByDisabledOsmRefs,
    fullFacilityPoints,
    nycHospitalPoints,
    osmElementsToFacilityPoints,
} from "@/maps/questions/facility-full";
import {
    hiderInsideEliminatedArea,
    nearestForSeekerAndHider,
} from "@/maps/questions/hider-flip";
import type {
    HomeGameMeasuringQuestions,
    MeasuringQuestion,
    MeasuringQuestionWithFacilityOsmRefs,
} from "@/maps/schema";
import { HOME_GAME_FACILITY_TYPES } from "@/maps/schema";

/**
 * Facility questions measure against every point at once, so the points are
 * merged into one multi-point feature (or an empty one when nothing is left).
 */
const combinedPointsOrEmpty = (points: Feature<Point>[] | null) =>
    !points || points.length === 0
        ? [turf.multiPolygon([])]
        : [turf.combine(turf.featureCollection(points)).features[0]];

const highSpeedBase = memoize(
    (features: Feature[]) => {
        const grouped = groupObjects(features);

        const neighbored = grouped
            .map((group) => {
                return turf.multiLineString(
                    connectToSeparateLines(
                        group
                            .filter((x) => turf.getType(x) === "LineString")
                            .map((x) => x.geometry.coordinates),
                    ),
                );
            })
            .filter((x) => x.geometry.coordinates.length > 0);

        return turf.combine(
            turf.buffer(
                turf.simplify(turf.featureCollection(neighbored), {
                    tolerance: 0.001,
                }),
                0.001,
            )!,
        ).features[0];
    },
    (features) => `${JSON.stringify(features.map((x) => x.geometry))}`,
);

const bboxExtension = (
    bBox: [number, number, number, number],
    distance: number,
): [number, number, number, number] => {
    const buffered = turf.bbox(
        turf.buffer(turf.bboxPolygon(bBox), Math.abs(distance), {
            units: "miles",
        })!,
    );

    const originalDeltaLat = bBox[3] - bBox[1];
    const originalDeltaLng = bBox[2] - bBox[0];

    return [
        buffered[0] - originalDeltaLng,
        buffered[1] - originalDeltaLat,
        buffered[2] + originalDeltaLng,
        buffered[3] + originalDeltaLat,
    ];
};

const COASTLINE_BUFFER_EPS_MI = 1e-6;

/** Large games pull huge OSM/NE shoreline sets; merging thousands of buffers bricks the main thread. */
const COASTLINE_MAX_LINE_FEATURES = 140;
const COASTLINE_BUFFER_STEPS = 10;
const COASTLINE_SIMPLIFY_SPAN_RATIO = 1 / 600;

function expandBboxDegrees(bbox: BBox, padDeg: number): BBox {
    return [
        bbox[0] - padDeg,
        bbox[1] - padDeg,
        bbox[2] + padDeg,
        bbox[3] + padDeg,
    ];
}

function coastlineSimplifyTolerance(bbox: BBox): number {
    const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1], 1e-8);
    return Math.min(0.025, span * COASTLINE_SIMPLIFY_SPAN_RATIO);
}

/** Min geodesic distance (miles) from a point to any line of a coast feature. */
function minPointToCoastDistanceMiles(
    point: Feature<Point>,
    f: Feature<LineString | MultiLineString>,
): number {
    let min = Infinity;
    for (const line of eachLineStringOfCoast(f)) {
        const d = turf.pointToLineDistance(point, line, {
            units: "miles",
            method: "geodesic",
        });
        if (d < min) min = d;
    }
    return min;
}

/**
 * Clip to game extent, simplify vertices, and cap feature count so coastline
 * measuring stays interactive for metro-state / multi-region games.
 *
 * `point` is the picked location: the length cap can otherwise drop the
 * shoreline nearest the seeker (if it's a short segment), which would make the
 * caller's `distanceToCoastline` reflect a farther coast and over-size the
 * exclusion buffer. So the nearest feature is force-retained past the cap.
 */
function lightenCoastlinesForMeasuring(
    fc: FeatureCollection<LineString | MultiLineString>,
    gameBbox: BBox,
    point: Feature<Point>,
    clipBboxOverride?: BBox,
): FeatureCollection<LineString | MultiLineString> {
    const tol = coastlineSimplifyTolerance(gameBbox);
    const span = Math.max(
        gameBbox[2] - gameBbox[0],
        gameBbox[3] - gameBbox[1],
        0.01,
    );
    // Default clip is a small pad around the game bbox. Callers measuring an
    // inland point pass a distance-expanded bbox so the nearest coast — which
    // can sit far outside the game bbox — survives the clip instead of being
    // dropped (which would blank the measurement).
    const clipBbox =
        clipBboxOverride ??
        expandBboxDegrees(gameBbox, Math.max(span * 0.12, 0.06));

    const scored: {
        len: number;
        f: Feature<LineString | MultiLineString>;
    }[] = [];

    for (const raw of fc.features) {
        const featureId = raw.id ?? raw.properties?.osm_id ?? "(unknown)";
        let clipped: Feature | undefined;
        try {
            clipped = turf.bboxClip(raw, clipBbox) as Feature | undefined;
        } catch (err) {
            console.debug("[coastline] bboxClip failed; skipping feature", {
                featureId,
                clipBbox,
                err,
            });
            continue;
        }
        if (!clipped?.geometry) continue;
        const gt = clipped.geometry.type;
        if (gt !== "LineString" && gt !== "MultiLineString") continue;

        let f = clipped as Feature<LineString | MultiLineString>;
        try {
            f = turf.simplify(f, {
                tolerance: tol,
                highQuality: false,
            }) as Feature<LineString | MultiLineString>;
        } catch (err) {
            console.debug("[coastline] simplify failed; skipping feature", {
                featureId,
                tol,
                err,
            });
            continue;
        }
        const lenKm = turf.length(f, { units: "kilometers" });
        if (lenKm < 0.02) continue;
        scored.push({ len: lenKm, f });
    }

    scored.sort((a, b) => b.len - a.len);

    // Only relevant when the cap actually drops features. Find the feature
    // nearest the picked point; if it ranks past the cap, swap it into the
    // kept set (displacing the shortest kept feature) so proximity survives.
    if (scored.length > COASTLINE_MAX_LINE_FEATURES) {
        let nearestIdx = -1;
        let nearestDist = Infinity;
        for (let i = 0; i < scored.length; i++) {
            const d = minPointToCoastDistanceMiles(point, scored[i]!.f);
            if (d < nearestDist) {
                nearestDist = d;
                nearestIdx = i;
            }
        }
        if (nearestIdx >= COASTLINE_MAX_LINE_FEATURES) {
            const [nearest] = scored.splice(nearestIdx, 1);
            scored.splice(COASTLINE_MAX_LINE_FEATURES - 1, 0, nearest!);
        }
    }

    const top = scored.slice(0, COASTLINE_MAX_LINE_FEATURES).map((x) => x.f);
    return { type: "FeatureCollection", features: top };
}

function mergePolygonsBinary(
    polys: Feature<Polygon | MultiPolygon>[],
): Feature<Polygon | MultiPolygon> | null {
    if (polys.length === 0) return null;
    let layer = [...polys];
    while (layer.length > 1) {
        const next: Feature<Polygon | MultiPolygon>[] = [];
        for (let i = 0; i < layer.length; i += 2) {
            if (i + 1 >= layer.length) {
                next.push(layer[i]!);
                continue;
            }
            const a = layer[i]!;
            const b = layer[i + 1]!;
            // turf.union can both return null AND throw (topological errors on
            // self-intersecting/degenerate geometry). Treat a throw exactly
            // like a null result so a single bad pair never aborts the whole
            // coastline merge — both inputs are preserved in the else branch.
            let u: Feature<Polygon | MultiPolygon> | null;
            try {
                u = turf.union(turf.featureCollection([a, b])) as Feature<
                    Polygon | MultiPolygon
                > | null;
            } catch {
                u = null;
            }
            if (u) next.push(u);
            else {
                let aBbox = "unknown";
                let bBbox = "unknown";
                let aAreaKm2 = "unknown";
                let bAreaKm2 = "unknown";
                try {
                    aBbox = JSON.stringify(turf.bbox(a));
                    bBbox = JSON.stringify(turf.bbox(b));
                    aAreaKm2 = (turf.area(a) / 1_000_000).toFixed(3);
                    bAreaKm2 = (turf.area(b) / 1_000_000).toFixed(3);
                } catch {
                    // Keep fallbacks above.
                }
                console.warn(
                    "[measuring] mergePolygonsBinary union failed; preserving both as MultiPolygon",
                    {
                        pairStartIndex: i,
                        aBbox,
                        bBbox,
                        aAreaKm2,
                        bAreaKm2,
                    },
                );
                // Union failed (topological error) — keep BOTH inputs by
                // concatenating their polygons into one MultiPolygon so no
                // exclusion region is silently dropped. Fall back to `a` only
                // if even the MultiPolygon construction throws.
                try {
                    const aPolys =
                        a.geometry.type === "Polygon"
                            ? [a.geometry.coordinates]
                            : a.geometry.coordinates;
                    const bPolys =
                        b.geometry.type === "Polygon"
                            ? [b.geometry.coordinates]
                            : b.geometry.coordinates;
                    next.push(turf.multiPolygon([...aPolys, ...bPolys]));
                } catch {
                    next.push(a);
                }
            }
        }
        layer = next;
    }
    return layer[0] ?? null;
}

function* eachLineStringOfCoast(
    f: Feature<LineString | MultiLineString>,
): Generator<Feature<LineString>> {
    const g = f.geometry;
    if (g.type === "LineString") {
        yield turf.lineString(g.coordinates);
    } else {
        for (const ring of g.coordinates) {
            yield turf.lineString(ring);
        }
    }
}

/** Clip shoreline lines to bbox, buffer each by `bufferMiles`, union for exclusion geometry. */
function mergeCoastalLineBuffers(
    coastFc: FeatureCollection<LineString | MultiLineString>,
    clipBbox: BBox,
    bufferMiles: number,
): Feature<Polygon | MultiPolygon> | null {
    const buf = Math.max(bufferMiles, COASTLINE_BUFFER_EPS_MI);
    const pieces: Feature<Polygon | MultiPolygon>[] = [];

    for (const f of coastFc.features) {
        let clipped: Feature | undefined;
        try {
            clipped = turf.bboxClip(f, clipBbox) as Feature | undefined;
        } catch {
            continue;
        }
        if (!clipped?.geometry) continue;
        const gt = clipped.geometry.type;
        if (gt !== "LineString" && gt !== "MultiLineString") continue;

        const b = turf.buffer(
            clipped as Feature<LineString | MultiLineString>,
            buf,
            { units: "miles", steps: COASTLINE_BUFFER_STEPS },
        );
        if (b) pieces.push(b as Feature<Polygon | MultiPolygon>);
    }

    if (pieces.length === 0) return null;
    if (pieces.length === 1) return pieces[0]!;
    return mergePolygonsBinary(pieces);
}

type BBox4 = [number, number, number, number];

export const determineMeasuringBoundary = async (
    question: MeasuringQuestion,
) => {
    const bBox = turf.bbox(mapGeoJSON.get()!) as BBox4;

    switch (question.type) {
        case "highspeed-measure-shinkansen": {
            const features = osmtogeojson(
                await findPlacesInZone(
                    "[highspeed=yes]",
                    "Finding high-speed lines...",
                    "nwr",
                    "geom",
                ),
            ).features;

            return [highSpeedBase(features)];
        }
        case "coastline": {
            /**
             * Shorelines from OSM in the map bbox: `natural=coastline` and
             * `waterway=riverbank` (e.g. Hudson / East River). Inland
             * `natural=water` polygons are not fetched, so lakes (Central Park,
             * etc.) are not treated as coastline. Falls back to Natural Earth
             * ocean coast when OSM returns nothing.
             */
            const pt = turf.point([question.lng, question.lat]);
            const rawCoast = await fetchCoastlinesForMeasuring(bBox);

            // Measure the nearest-coast distance against the UNCLIPPED raw set
            // first. Clipping/lightening before measuring can drop the nearest
            // coastline for an inland point (its coast lies outside the game
            // bbox), leaving an empty set and blanking the measurement.
            let distanceToCoastline = Infinity;
            for (const f of rawCoast.features) {
                const d = minPointToCoastDistanceMiles(pt, f);
                if (d < distanceToCoastline) distanceToCoastline = d;
            }
            if (!Number.isFinite(distanceToCoastline)) {
                // No coastline anywhere (empty raw set) — nothing to exclude.
                return [turf.bboxPolygon(bBox)];
            }

            const bufMiles = Math.max(
                distanceToCoastline,
                COASTLINE_BUFFER_EPS_MI,
            );
            const extendedBbox = bboxExtension(bBox, bufMiles);

            // Lighten AFTER measuring, clipping to the distance-expanded bbox so
            // the nearest coast survives even when it lies outside the game bbox.
            const coastFc = lightenCoastlinesForMeasuring(
                rawCoast,
                bBox,
                pt,
                extendedBbox,
            );
            if (coastFc.features.length === 0) {
                return [turf.bboxPolygon(bBox)];
            }

            const exclusion = mergeCoastalLineBuffers(
                coastFc,
                extendedBbox,
                bufMiles,
            );
            if (!exclusion) {
                return [turf.bboxPolygon(bBox)];
            }

            const diff = turf.difference(
                turf.featureCollection([turf.bboxPolygon(bBox), exclusion]),
            );
            return diff ? [diff] : [turf.bboxPolygon(bBox)];
        }
        case "airport":
            return [
                turf.combine(
                    turf.featureCollection(
                        uniqBy(
                            (
                                await findPlacesInZone(
                                    overpassAirportIataFilter(),
                                    "Finding airports...",
                                    "nwr",
                                    "center",
                                    [],
                                    240,
                                )
                            ).elements,
                            (feature: any) => feature.tags.iata,
                        ).map((x: any) =>
                            turf.point([
                                x.center ? x.center.lon : x.lon,
                                x.center ? x.center.lat : x.lat,
                            ]),
                        ),
                    ),
                ).features[0],
            ];
        case "city": {
            const cityData = await findPlacesInZone(
                OVERPASS_MAJOR_CITY_FILTER,
                "Finding cities...",
            );
            return combinedPointsOrEmpty(
                filterFacilityPointsByDisabledOsmRefs(
                    osmElementsToFacilityPoints(cityData.elements ?? []),
                    (question as MeasuringQuestionWithFacilityOsmRefs)
                        .disabledFacilityOsmRefs,
                ),
            );
        }
        case "aquarium-full":
        case "zoo-full":
        case "theme_park-full":
        case "peak-full":
        case "museum-full":
        case "hospital-full":
        case "cinema-full":
        case "library-full":
        case "golf_course-full":
        case "consulate-full":
        case "park-full": {
            return combinedPointsOrEmpty(
                await fullFacilityPoints(
                    question.type,
                    (question as MeasuringQuestionWithFacilityOsmRefs)
                        .disabledFacilityOsmRefs,
                ),
            );
        }
        case "hospital-nyc-full": {
            // Curated NYC hospital list (not an Overpass *-full query, so it
            // can't share the block above). Matches the matching-side path,
            // which also resolves this type via nycHospitalPoints.
            return combinedPointsOrEmpty(
                nycHospitalPoints(
                    (question as MeasuringQuestionWithFacilityOsmRefs)
                        .disabledFacilityOsmRefs,
                ),
            );
        }
        case "custom-measure":
            return turf.combine(
                turf.featureCollection((question as any).geo.features),
            ).features;
        case "aquarium":
        case "zoo":
        case "theme_park":
        case "peak":
        case "museum":
        case "hospital":
        case "cinema":
        case "library":
        case "golf_course":
        case "consulate":
        case "park":
        case "mcdonalds":
        case "seven11":
        case "rail-measure":
        case "pick-type":
            return false;
    }
};

const bufferedDeterminer = memoize(
    async (question: MeasuringQuestion) => {
        const placeData = await determineMeasuringBoundary(question);

        if (placeData === false || placeData === undefined) return false;

        return arcBufferToPoint(
            turf.featureCollection(placeData as any),
            question.lat,
            question.lng,
        );
    },
    (question) => {
        const playableDigest = playableTerritoryDigest();
        const facilityOsmExtras =
            question.type === "city" ||
            (typeof question.type === "string" &&
                question.type.endsWith("-full"))
                ? {
                      disabledFacilityOsmRefs: normalizedOsmRefs(
                          (question as MeasuringQuestionWithFacilityOsmRefs)
                              .disabledFacilityOsmRefs,
                      ),
                  }
                : {};
        return JSON.stringify({
            type: question.type,
            lat: question.lat,
            lng: question.lng,
            entirety: polyGeoJSON.get()
                ? polyGeoJSON.get()
                : mapGeoLocation.get(),
            playableDigest,
            geo: (question as any).geo,
            ...facilityOsmExtras,
        });
    },
);

export const adjustPerMeasuring = async (
    question: MeasuringQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    const buffer = await bufferedDeterminer(question);

    if (buffer === false) return mapData;

    return modifyMapData(mapData, buffer, question.hiderCloser);
};

export const hiderifyMeasuring = async (question: MeasuringQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    if (question.type === "pick-type") {
        return question;
    }

    if (HOME_GAME_FACILITY_TYPES.includes(question.type)) {
        const { seekerNearest, hiderNearest } = await nearestForSeekerAndHider(
            question as HomeGameMeasuringQuestions,
            $hiderMode,
            { hiderCloser: true },
        );

        question.hiderCloser =
            seekerNearest.properties.distanceToPoint >
            hiderNearest.properties.distanceToPoint;

        return question;
    }

    if (question.type === "rail-measure") {
        const stations = trainStations.get();

        if (stations.length === 0) {
            return question;
        }

        const location = turf.point([question.lng, question.lat]);

        const nearestTrainStation = turf.nearestPoint(
            location,
            turf.featureCollection(stations.map((x) => x.properties)),
        );

        const distance = turf.distance(location, nearestTrainStation);

        const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

        const hiderNearest = turf.nearestPoint(
            hider,
            turf.featureCollection(stations.map((x) => x.properties)),
        );

        const hiderDistance = turf.distance(hider, hiderNearest);

        question.hiderCloser = hiderDistance < distance;
    }

    if (question.type === "mcdonalds" || question.type === "seven11") {
        const points = await findPlacesSpecificInZone(
            question.type === "mcdonalds"
                ? QuestionSpecificLocation.McDonalds
                : QuestionSpecificLocation.Seven11,
        );

        const seeker = turf.point([question.lng, question.lat]);
        const nearest = turf.nearestPoint(seeker, points as any);

        const distance = turf.distance(seeker, nearest, {
            units: "miles",
        });

        const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);
        const hiderNearest = turf.nearestPoint(hider, points as any);

        const hiderDistance = turf.distance(hider, hiderNearest, {
            units: "miles",
        });

        question.hiderCloser = hiderDistance < distance;
        return question;
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    if (
        await hiderInsideEliminatedArea($mapGeoJSON, $hiderMode, (mapData) =>
            adjustPerMeasuring(question, mapData),
        )
    ) {
        question.hiderCloser = !question.hiderCloser;
    }

    return question;
};

export const measuringPlanningPolygon = async (question: MeasuringQuestion) => {
    try {
        const buffered = await bufferedDeterminer(question);

        if (buffered === false) return false;

        return turf.polygonToLine(buffered);
    } catch {
        return false;
    }
};
