import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import memoize from "lodash/memoize";
import uniqBy from "lodash/uniqBy";
import { toast } from "react-toastify";

import {
    hiderMode,
    mapGeoJSON,
    mapGeoLocation,
    playableTerritoryUnion,
    polyGeoJSON,
} from "@/lib/context";
import { getGtfsStationNamesForLineRef } from "@/lib/transit/line-membership";
import { stationNameMatchKey } from "@/lib/transit/osm-gtfs-match";
import {
    DEFAULT_ADMIN_BOUNDARY_OVERPASS_TIMEOUT_SEC,
    findAdminBoundary,
    findLandmassBoundaryAtPoint,
    findPlacesInZone,
    findPoliticalDistrictBoundaryAtPoint,
    findZipBoundaryAtPoint,
    nearestToQuestion,
    OVERPASS_MAJOR_CITY_FILTER,
    overpassAirportIataFilter,
    prettifyLocation,
    trainLineNodeFinder,
} from "@/maps/api";
import osmtogeojson from "@/maps/api/osm-to-geojson";
import { holedMask, modifyMapData, safeUnion } from "@/maps/geo-utils";
import { geoSpatialVoronoi } from "@/maps/geo-utils";
import {
    fetchFullFacilityElements,
    filterFacilityPointsByDisabledOsmRefs,
    nycHospitalPoints,
    osmElementsToFacilityPoints,
    validateFullFacilityFetch,
} from "@/maps/questions/facility-full";
import type {
    APILocations,
    HomeGameMatchingQuestions,
    MatchingQuestion,
    MatchingQuestionWithFacilityOsmRefs,
} from "@/maps/schema";

export function normalizeMatchingAirportIata(s: string): string {
    return s.trim().toUpperCase();
}

async function fetchAirportPointsUnfiltered(
    question: MatchingQuestion,
): Promise<Feature<Point>[]> {
    if (question.type !== "airport") return [];
    const elements = uniqBy(
        (
            await findPlacesInZone(
                overpassAirportIataFilter({
                    activeOnly: question.activeOnly === true,
                }),
                "Finding airports...",
                "nwr",
                "center",
                [],
                240,
                true,
            )
        ).elements,
        (feature: any) => feature.tags?.iata,
    );
    return elements.map((x: any) => {
        const lng = x.center ? x.center.lon : x.lon;
        const lat = x.center ? x.center.lat : x.lat;
        const iata = normalizeMatchingAirportIata(String(x.tags?.iata ?? ""));
        const name =
            typeof x.tags?.name === "string" && x.tags.name.trim()
                ? x.tags.name.trim()
                : iata || "Airport";
        return turf.point([lng, lat], { iata, name });
    });
}

function filterAirportsByDisabled(
    points: Feature<Point>[],
    question: MatchingQuestion,
): Feature<Point>[] {
    if (question.type !== "airport") return points;
    const disabled = new Set(
        (question.disabledAirportIatas ?? []).map(normalizeMatchingAirportIata),
    );
    return points.filter((p) => {
        const iata = normalizeMatchingAirportIata(
            String((p.properties as { iata?: string } | null)?.iata ?? ""),
        );
        return iata.length > 0 && !disabled.has(iata);
    });
}

/** All IATA airports in the current territory (before per-airport exclusions). */
export async function listAirportMatchingCandidates(
    question: MatchingQuestion,
): Promise<Feature<Point>[]> {
    return fetchAirportPointsUnfiltered(question);
}

export const findMatchingPlaces = async (question: MatchingQuestion) => {
    switch (question.type) {
        case "pick-type":
        case "same-landmass":
        case "same-zip":
        case "same-district":
            return [];
        case "airport": {
            return filterAirportsByDisabled(
                await fetchAirportPointsUnfiltered(question),
                question,
            );
        }
        case "major-city": {
            const cityData = await findPlacesInZone(
                OVERPASS_MAJOR_CITY_FILTER,
                "Finding cities...",
                "nwr",
                "center",
                [],
                0,
                true, // skipPlayableTerritoryFilter — same Voronoi reason as facilities
            );
            const pts = osmElementsToFacilityPoints(cityData.elements ?? []);
            return filterFacilityPointsByDisabledOsmRefs(
                pts,
                (question as MatchingQuestionWithFacilityOsmRefs)
                    .disabledFacilityOsmRefs,
            );
        }
        case "custom-points": {
            return question.geo!;
        }
        case "hospital-nyc-full": {
            return nycHospitalPoints(
                (question as MatchingQuestionWithFacilityOsmRefs)
                    .disabledFacilityOsmRefs,
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
            const location = question.type.split("-full")[0] as APILocations;

            const { elements, remark } = await fetchFullFacilityElements(
                location,
                `Finding ${prettifyLocation(location, true).toLowerCase()}...`,
            );
            if (!validateFullFacilityFetch(elements, remark, location)) {
                return [];
            }
            const pts = osmElementsToFacilityPoints(elements);
            return filterFacilityPointsByDisabledOsmRefs(
                pts,
                (question as MatchingQuestionWithFacilityOsmRefs)
                    .disabledFacilityOsmRefs,
            );
        }
    }
};

export const determineMatchingBoundary = memoize(
    async (
        question: MatchingQuestion,
        overpassTimeoutSeconds: number = DEFAULT_ADMIN_BOUNDARY_OVERPASS_TIMEOUT_SEC,
    ) => {
        let boundary;

        switch (question.type) {
            case "pick-type":
                return false;
            case "same-landmass": {
                boundary = await findLandmassBoundaryAtPoint(
                    question.lat,
                    question.lng,
                    overpassTimeoutSeconds,
                );
                if (!boundary) {
                    toast.warning(
                        "Could not find a landmass boundary for this location.",
                    );
                    return false;
                }
                break;
            }
            case "same-zip": {
                boundary = await findZipBoundaryAtPoint(
                    question.lat,
                    question.lng,
                    overpassTimeoutSeconds,
                );
                if (!boundary) {
                    toast.warning(
                        "Could not find a ZIP/postal boundary for this location.",
                    );
                    return false;
                }
                break;
            }
            case "same-district": {
                boundary = await findPoliticalDistrictBoundaryAtPoint(
                    question.lat,
                    question.lng,
                    overpassTimeoutSeconds,
                );
                if (!boundary) {
                    toast.warning(
                        "Could not find a political district for this location.",
                    );
                    return false;
                }
                break;
            }
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
            case "same-first-letter-station":
            case "same-length-station":
            case "same-train-line": {
                return false;
            }
            case "custom-zone": {
                boundary = question.geo;
                break;
            }
            case "zone":
            case "same-admin-zone": {
                boundary = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    question.cat.adminLevel,
                    overpassTimeoutSeconds,
                );

                if (!boundary) {
                    toast.error("No boundary found for this zone");
                    throw new Error("No boundary found");
                }
                break;
            }
            case "letter-zone": {
                const zone = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    question.cat.adminLevel,
                );

                if (!zone) {
                    toast.error("No boundary found for this zone");
                    throw new Error("No boundary found");
                }

                let englishName = zone.properties?.["name:en"];

                if (!englishName) {
                    const name = zone.properties?.name;

                    if (/^[a-zA-Z]$/.test(name[0])) {
                        englishName = name;
                    } else {
                        toast.error("No English name found for this zone");
                        throw new Error("No English name");
                    }
                }

                const letter = englishName[0].toUpperCase();

                boundary = turf.featureCollection(
                    osmtogeojson(
                        await findPlacesInZone(
                            `[admin_level=${question.cat.adminLevel}]["name:en"~"^${letter}.+"]`, // Regex is faster than filtering afterward
                            `Finding zones that start with the same letter (${letter})...`,
                            "relation",
                            "geom",
                            [
                                `[admin_level=${question.cat.adminLevel}]["name"~"^${letter}.+"]`,
                            ], // Regex is faster than filtering afterward
                            overpassTimeoutSeconds,
                        ),
                    ).features.filter(
                        (x): x is Feature<Polygon | MultiPolygon> =>
                            x.geometry &&
                            (x.geometry.type === "Polygon" ||
                                x.geometry.type === "MultiPolygon"),
                    ),
                );

                // It's either simplify or crash. Technically this could be bad if someone's hiding zone was inside multiple zones, but that's unlikely.
                boundary = safeUnion(
                    turf.simplify(boundary, {
                        tolerance: 0.001,
                        highQuality: true,
                        mutate: true,
                    }),
                );

                break;
            }
            case "airport":
            case "major-city":
            case "aquarium-full":
            case "zoo-full":
            case "theme_park-full":
            case "peak-full":
            case "museum-full":
            case "hospital-full":
            case "hospital-nyc-full":
            case "cinema-full":
            case "library-full":
            case "golf_course-full":
            case "consulate-full":
            case "park-full":
            case "custom-points": {
                const data = await findMatchingPlaces(question);
                const fc: FeatureCollection<Point> = Array.isArray(data)
                    ? turf.featureCollection(data)
                    : (data as FeatureCollection<Point>);
                if (!fc.features.length) {
                    if (question.type === "airport") {
                        toast.warning(
                            "No commercial airports found in the current territory.",
                            { toastId: "matching-airport-no-points" },
                        );
                        return false;
                    }
                    break;
                }
                if (question.type === "airport" && fc.features.length === 1) {
                    toast.info(
                        "Only one commercial airport found. 'Same' matches all zones and 'Different' matches none.",
                        { toastId: "matching-airport-single-point" },
                    );
                }

                const voronoi = geoSpatialVoronoi(fc);
                const point = turf.point([question.lng, question.lat]);

                for (const feature of voronoi.features) {
                    if (turf.booleanPointInPolygon(point, feature)) {
                        boundary = feature;
                        break;
                    }
                }
                if (!boundary) {
                    const nearest = turf.nearestPoint(
                        point,
                        fc as any,
                    ) as Feature<Point, { name?: string } | null>;
                    boundary =
                        voronoi.features.find((feature) => {
                            const siteCoords = (feature.properties as any)?.site
                                ?.geometry?.coordinates;
                            if (
                                Array.isArray(siteCoords) &&
                                siteCoords.length >= 2 &&
                                typeof siteCoords[0] === "number" &&
                                typeof siteCoords[1] === "number"
                            ) {
                                return (
                                    turf.distance(
                                        turf.point([
                                            siteCoords[0],
                                            siteCoords[1],
                                        ]),
                                        nearest,
                                        { units: "kilometers" },
                                    ) < 0.0001
                                );
                            }
                            return (
                                (feature.properties as any)?.site?.properties
                                    ?.name !== undefined &&
                                (feature.properties as any)?.site?.properties
                                    ?.name === nearest.properties?.name
                            );
                        }) ?? boundary;
                }
                break;
            }
        }

        return boundary;
    },
    (question: MatchingQuestion & { geo?: unknown; cat?: unknown }) => {
        const airportExtras =
            question.type === "airport"
                ? {
                      activeOnly: question.activeOnly === true,
                      disabledAirportIatas: [
                          ...(question.disabledAirportIatas ?? []),
                      ]
                          .map(normalizeMatchingAirportIata)
                          .filter(Boolean)
                          .sort(),
                  }
                : {};
        const qRefs = (question as MatchingQuestionWithFacilityOsmRefs)
            .disabledFacilityOsmRefs;
        const facilityOsmExtras =
            question.type === "major-city" ||
            question.type === "hospital-nyc-full" ||
            (typeof question.type === "string" &&
                question.type.endsWith("-full"))
                ? {
                      disabledFacilityOsmRefs: [...(qRefs ?? [])]
                          .map((s) => s.trim().toLowerCase())
                          .filter(Boolean)
                          .sort(),
                  }
                : {};
        const ptu = playableTerritoryUnion.get();
        const playableDigest =
            ptu?.geometry != null
                ? turf
                      .bbox(ptu as Feature<Polygon | MultiPolygon>)
                      .map((x: number) => x.toFixed(4))
                      .join(",")
                : undefined;
        return JSON.stringify({
            type: question.type,
            lat: question.lat,
            lng: question.lng,
            cat: question.cat,
            geo: question.geo,
            entirety: polyGeoJSON.get()
                ? polyGeoJSON.get()
                : mapGeoLocation.get(),
            playableDigest,
            ...airportExtras,
            ...facilityOsmExtras,
        });
    },
);

export const adjustPerMatching = async (
    question: MatchingQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    const boundary = await determineMatchingBoundary(question);

    if (boundary === false) {
        return mapData;
    }

    const result = modifyMapData(mapData, boundary, question.same);
    if (result === null) {
        toast.warning(
            `This matching answer has no overlap with the remaining territory — the ${
                question.same ? '"Same"' : '"Different"'
            } result may be contradictory with prior questions.`,
            { toastId: "matching-no-territory" },
        );
        return mapData;
    }
    return result;
};

export const hiderifyMatching = async (question: MatchingQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    if (question.type === "pick-type") {
        return question;
    }

    if (
        [
            "aquarium",
            "zoo",
            "theme_park",
            "peak",
            "museum",
            "hospital",
            "cinema",
            "library",
            "golf_course",
            "consulate",
            "park",
        ].includes(question.type)
    ) {
        const questionNearest = await nearestToQuestion(
            question as HomeGameMatchingQuestions,
        );
        const hiderNearest = await nearestToQuestion({
            lat: $hiderMode.latitude,
            lng: $hiderMode.longitude,
            same: true,
            type: (question as HomeGameMatchingQuestions).type,
            drag: false,
            color: "black",
            collapsed: false,
        });

        question.same =
            questionNearest.properties.name === hiderNearest.properties.name;

        return question;
    }

    if (
        question.type === "same-first-letter-station" ||
        question.type === "same-length-station" ||
        question.type === "same-train-line"
    ) {
        const hiderPoint = turf.point([
            $hiderMode.longitude,
            $hiderMode.latitude,
        ]);
        const seekerPoint = turf.point([question.lng, question.lat]);

        const places = osmtogeojson(
            await findPlacesInZone(
                "[railway=station]",
                "Finding train stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
                "node",
            ),
        ) as FeatureCollection<Point>;

        const nearestHiderTrainStation = turf.nearestPoint(hiderPoint, places);
        const nearestSeekerTrainStation = turf.nearestPoint(
            seekerPoint,
            places,
        );

        if (question.type === "same-train-line") {
            const { nodeIds, stops } = await trainLineNodeFinder(
                nearestSeekerTrainStation.properties.id,
                question.lineRef,
                { latitude: question.lat, longitude: question.lng },
            );

            const hiderName =
                nearestHiderTrainStation.properties["name:en"] ||
                nearestHiderTrainStation.properties.name;
            const hiderKey = hiderName
                ? stationNameMatchKey(String(hiderName))
                : "";
            const hiderCoord =
                nearestHiderTrainStation.geometry?.coordinates ?? [];
            const [hiderLon, hiderLat] = hiderCoord;

            // ~6,371,000 m * acos shortcut: small distances → planar OK,
            // but we want consistency with the zone filter's haversine
            // proximity check. Inline (no shared util import to avoid
            // ts/eslint cross-file churn).
            const distanceMeters = (
                aLat: number,
                aLon: number,
                bLat: number,
                bLon: number,
            ) => {
                const R = 6_371_000;
                const toRad = Math.PI / 180;
                const dLat = (bLat - aLat) * toRad;
                const dLon = (bLon - aLon) * toRad;
                const lat1 = aLat * toRad;
                const lat2 = bLat * toRad;
                const h =
                    Math.sin(dLat / 2) ** 2 +
                    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
                return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
            };
            const PROXIMITY_M = 250;

            // Match priority: OSM node id → spatial proximity to a route
            // stop → OSM stop names → GTFS names. Proximity is the homonym
            // killer (e.g. "111 St" on J vs 7).
            let resolved = false;
            if (nodeIds.length > 0) {
                const hiderIdRaw = nearestHiderTrainStation.properties.id;
                const hiderIdNum =
                    typeof hiderIdRaw === "string" && hiderIdRaw.includes("/")
                        ? parseInt(hiderIdRaw.split("/")[1], 10)
                        : NaN;
                if (!Number.isNaN(hiderIdNum) && nodeIds.includes(hiderIdNum)) {
                    question.same = true;
                    resolved = true;
                }
            }
            if (
                !resolved &&
                stops.length > 0 &&
                typeof hiderLat === "number" &&
                typeof hiderLon === "number"
            ) {
                const onLine = stops.some(
                    (s) =>
                        distanceMeters(hiderLat, hiderLon, s.lat, s.lon) <=
                        PROXIMITY_M,
                );
                if (onLine) {
                    question.same = true;
                    resolved = true;
                }
            }
            if (!resolved) {
                const osmNameKeys = new Set(
                    stops.map((s) => s.nameKey).filter(Boolean),
                );
                if (osmNameKeys.size > 0 && hiderKey) {
                    if (osmNameKeys.has(hiderKey)) {
                        question.same = true;
                        resolved = true;
                    }
                }
            }
            if (!resolved) {
                const gtfsNames = await getGtfsStationNamesForLineRef(
                    question.lineRef ?? "",
                );
                if (gtfsNames.size > 0 && hiderKey) {
                    question.same = gtfsNames.has(hiderKey);
                    resolved = true;
                }
            }
            if (!resolved) {
                question.same = false;
            }
        }

        const hiderEnglishName =
            nearestHiderTrainStation.properties["name:en"] ||
            nearestHiderTrainStation.properties.name;
        const seekerEnglishName =
            nearestSeekerTrainStation.properties["name:en"] ||
            nearestSeekerTrainStation.properties.name;

        if (!hiderEnglishName || !seekerEnglishName) {
            return question;
        }

        if (question.type === "same-first-letter-station") {
            if (
                hiderEnglishName[0].toUpperCase() ===
                seekerEnglishName[0].toUpperCase()
            ) {
                question.same = true;
            } else {
                question.same = false;
            }
        } else if (question.type === "same-length-station") {
            if (hiderEnglishName.length === seekerEnglishName.length) {
                question.lengthComparison = "same";
            } else if (hiderEnglishName.length < seekerEnglishName.length) {
                question.lengthComparison = "shorter";
            } else {
                question.lengthComparison = "longer";
            }
        }

        return question;
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    // eslint-disable-next-line no-useless-assignment
    let feature = null;

    try {
        feature = holedMask((await adjustPerMatching(question, $mapGeoJSON))!);
    } catch {
        try {
            const maskedMap = holedMask($mapGeoJSON);
            if (!maskedMap) return question;
            feature = await adjustPerMatching(question, {
                type: "FeatureCollection",
                features: [maskedMap],
            });
        } catch {
            return question;
        }
    }

    if (feature === null || feature === undefined) return question;

    const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

    if (turf.booleanPointInPolygon(hiderPoint, feature)) {
        question.same = !question.same;
    }

    return question;
};

export const matchingPlanningPolygon = async (question: MatchingQuestion) => {
    try {
        const boundary = await determineMatchingBoundary(question);

        if (boundary === false) {
            return false;
        }

        return turf.polygonToLine(boundary);
    } catch {
        return false;
    }
};
