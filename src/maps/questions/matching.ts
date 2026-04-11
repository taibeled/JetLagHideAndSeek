import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    hiderMode,
    linkHiderToGPS,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
} from "@/lib/context";
import {
    findAdminBoundary,
    findPlacesInZone,
    findPlacesSpecificInZone,
    LOCATION_FIRST_TAG,
    nearestToQuestion,
    prettifyLocation,
    sydneyStationPointsForLineRefs,
    sydneyRailLineRefsForStation,
} from "@/maps/api";
import { QuestionSpecificLocation } from "@/maps/api";
import { holedMask, modifyMapData, safeUnion } from "@/maps/geo-utils";
import { geoSpatialVoronoi } from "@/maps/geo-utils";
import type {
    APILocations,
    HomeGameMatchingQuestions,
    MatchingQuestion,
} from "@/maps/schema";

const SYDNEY_MANUAL_SELECTION_EXCLUDED_STATIONS = new Set([
    "central",
    "town hall",
    "st james",
    "museum",
    "circular quay",
]);

const normalizeStationName = (name: string) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

const SYDNEY_RAIL_LINE_PATTERN = /(L[1-4]|M1|T[1-5]|T8|T9)/gi;

const parseSydneyLineRefs = (value?: string) => {
    if (!value) return [] as string[];
    return _.uniq((value.match(SYDNEY_RAIL_LINE_PATTERN) ?? []).map((line) => line.toUpperCase()));
};

const stationSydneyLines = (feature: Feature<Point>) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    return _.uniq([
        ...parseSydneyLineRefs(typeof props.route_ref === "string" ? props.route_ref : undefined),
        ...parseSydneyLineRefs(typeof props.line === "string" ? props.line : undefined),
        ...parseSydneyLineRefs(typeof props["network:ref"] === "string" ? (props["network:ref"] as string) : undefined),
        ...parseSydneyLineRefs(typeof props["railway:ref"] === "string" ? (props["railway:ref"] as string) : undefined),
    ]);
};

const boundaryName = (boundary: any) =>
    boundary?.properties?.["name:en"] ??
    boundary?.properties?.name ??
    "Unknown";

export const findMatchingPlaces = async (question: MatchingQuestion) => {
    switch (question.type) {
        case "airport": {
            return _.uniqBy(
                (
                    await findPlacesInZone(
                        '["aeroway"="aerodrome"]["iata"]', // Only commercial airports have IATA codes,
                        "Finding airports...",
                    )
                ).elements,
                (feature: any) => feature.tags.iata,
            ).map((x) =>
                turf.point([
                    x.center ? x.center.lon : x.lon,
                    x.center ? x.center.lat : x.lat,
                ]),
            );
        }
        case "major-city": {
            return (
                await findPlacesInZone(
                    '[place=city]["population"~"^[1-9]+[0-9]{6}$"]', // The regex is faster than (if:number(t["population"])>1000000)
                    "Finding cities...",
                )
            ).elements.map((x: any) =>
                turf.point([
                    x.center ? x.center.lon : x.lon,
                    x.center ? x.center.lat : x.lat,
                ]),
            );
        }
        case "custom-points": {
            return question.geo!;
        }
        case "same-nearest-mcdonalds": {
            const points = await findPlacesSpecificInZone(
                QuestionSpecificLocation.McDonalds,
            );
            return points.features as any;
        }
        case "same-nearest-synagogue": {
            const points = await findPlacesSpecificInZone(
                QuestionSpecificLocation.Synagogue,
            );
            return points.features as any;
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

            const data = await findPlacesInZone(
                `[${LOCATION_FIRST_TAG[location]}=${location}]`,
                `Finding ${prettifyLocation(location, true).toLowerCase()}...`,
                "nwr",
                "center",
                [],
                60,
            );

            if (data.remark && data.remark.startsWith("runtime error")) {
                toast.error(
                    `Error finding ${prettifyLocation(
                        location,
                        true,
                    ).toLowerCase()}. Please enable hiding zone mode and switch to the Large Game variation of this question.`,
                );
                return [];
            }

            if (data.elements.length >= 1000) {
                toast.error(
                    `Too many ${prettifyLocation(
                        location,
                        true,
                    ).toLowerCase()} found (${data.elements.length}). Please enable hiding zone mode and switch to the Large Game variation of this question.`,
                );
                return [];
            }

            return data.elements.map((x: any) =>
                turf.point([
                    x.center ? x.center.lon : x.lon,
                    x.center ? x.center.lat : x.lat,
                ]),
            );
        }
    }
};

export const determineMatchingBoundary = _.memoize(
    async (question: MatchingQuestion) => {
        let boundary;

        switch (question.type) {
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
            {
                return false;
            }
            case "same-train-line": {
                const places = osmtogeojson(
                    await findPlacesInZone(
                        "[railway=station]",
                        "Finding train stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
                        "node",
                    ),
                ) as FeatureCollection<Point>;

                const stationFeatures = places.features.filter(
                    (feature): feature is Feature<Point> =>
                        !!feature.geometry && feature.geometry.type === "Point",
                );

                if (stationFeatures.length === 0) {
                    return false;
                }

                const seekerPoint = turf.point([question.lng, question.lat]);
                const nearestSeekerTrainStation = turf.nearestPoint(
                    seekerPoint,
                    places,
                ) as Feature<Point>;

                let seekerLines = stationSydneyLines(nearestSeekerTrainStation);

                if (
                    seekerLines.length === 0 &&
                    typeof nearestSeekerTrainStation.properties?.id === "string"
                ) {
                    seekerLines = await sydneyRailLineRefsForStation(
                        nearestSeekerTrainStation.properties.id,
                    );
                }

                const selectedLine =
                    question.selectedSydneyTrainLine &&
                    question.selectedSydneyTrainLine !== "AUTO" &&
                    question.selectedSydneyTrainLine !== "UNSET"
                        ? question.selectedSydneyTrainLine
                        : null;

                const activeLines = selectedLine
                    ? seekerLines.includes(selectedLine)
                        ? [selectedLine]
                        : []
                    : seekerLines;

                if (activeLines.length === 0) {
                    return false;
                }

                const points = turf.featureCollection(
                    stationFeatures.map((feature) => {
                        const lines = stationSydneyLines(feature);
                        return turf.point(feature.geometry.coordinates, {
                            ...(feature.properties ?? {}),
                            sydneyLines: lines,
                        });
                    }),
                );

                const lineStationPoints = await sydneyStationPointsForLineRefs(
                    activeLines,
                );
                const hasLineStationPoints =
                    lineStationPoints.features.length > 0;

                const voronoi = geoSpatialVoronoi(points);
                const selectedPolygons: Feature<Polygon | MultiPolygon>[] = [];

                points.features.forEach((stationPoint) => {
                    const stationLines = (stationPoint.properties?.sydneyLines ?? []) as string[];
                    const isNearSelectedLineStation = hasLineStationPoints
                        ? lineStationPoints.features.some((linePoint) =>
                              turf.distance(linePoint, stationPoint, {
                                  units: "kilometers",
                              }) <= 0.35,
                          )
                        : false;
                    const isOnSelectedLineByTags = stationLines.some((line) =>
                        activeLines.includes(line),
                    );

                    if (!isNearSelectedLineStation && !isOnSelectedLineByTags) {
                        return;
                    }

                    for (const cell of voronoi.features) {
                        if (turf.booleanPointInPolygon(stationPoint, cell)) {
                            selectedPolygons.push(cell);
                            break;
                        }
                    }
                });

                if (selectedPolygons.length === 0) {
                    return false;
                }

                boundary = safeUnion(
                    turf.featureCollection(
                        _.uniqBy(selectedPolygons, (feature) =>
                            JSON.stringify(feature.geometry.coordinates),
                        ),
                    ),
                );
                break;
            }
            case "custom-zone": {
                boundary = question.geo;
                break;
            }
            case "zone": {
                boundary = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    question.cat.adminLevel,
                );

                if (!boundary) {
                    toast.error("No boundary found for this zone");
                    throw new Error("No boundary found");
                }
                break;
            }
            case "suburb-zone": {
                boundary = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    9,
                );

                if (!boundary) {
                    toast.error("No suburb boundary found");
                    throw new Error("No suburb boundary found");
                }
                break;
            }
            case "federal-electorate-zone": {
                boundary = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    6,
                );

                if (!boundary) {
                    toast.error("No federal electorate boundary found");
                    throw new Error("No federal electorate boundary found");
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
            case "same-nearest-mcdonalds":
            case "same-nearest-synagogue":
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
            case "park-full":
            case "custom-points": {
                const data = await findMatchingPlaces(question);

                const voronoi = geoSpatialVoronoi(data);
                const point = turf.point([question.lng, question.lat]);

                for (const feature of voronoi.features) {
                    if (turf.booleanPointInPolygon(point, feature)) {
                        boundary = feature;
                        break;
                    }
                }
                break;
            }
        }

        return boundary;
    },
    (question: MatchingQuestion & { geo?: unknown; cat?: unknown }) =>
        JSON.stringify({
            type: question.type,
            lat: question.lat,
            lng: question.lng,
            cat: question.cat,
            geo: question.geo,
            entirety: polyGeoJSON.get()
                ? polyGeoJSON.get()
                : mapGeoLocation.get(),
        }),
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

    return modifyMapData(mapData, boundary, question.same);
};

export const hiderifyMatching = async (question: MatchingQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const maybeFreezeAndReturn = () => {
        if (linkHiderToGPS.get()) {
            (question as any).autoFrozen = true;
        }
        return question;
    };

    if ((question as any).autoFrozen) {
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
        question.debug = {
            seekerNearest:
                questionNearest.properties?.name ??
                questionNearest.properties?.["name:en"] ??
                "Unknown",
            hiderNearest:
                hiderNearest.properties?.name ??
                hiderNearest.properties?.["name:en"] ??
                "Unknown",
            detectedResult: question.same ? "same" : "different",
        };

        return maybeFreezeAndReturn();
    }

    if (
        question.type === "same-nearest-mcdonalds" ||
        question.type === "same-nearest-synagogue"
    ) {
        const seekerPoint = turf.point([question.lng, question.lat]);
        const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

        const places = await findPlacesSpecificInZone(
            question.type === "same-nearest-mcdonalds"
                ? QuestionSpecificLocation.McDonalds
                : QuestionSpecificLocation.Synagogue,
        );

        if (!places.features.length) {
            return maybeFreezeAndReturn();
        }

        const seekerNearest = turf.nearestPoint(seekerPoint, places as any) as any;
        const hiderNearest = turf.nearestPoint(hiderPoint, places as any) as any;

        const seekerId = seekerNearest.properties?.id;
        const hiderId = hiderNearest.properties?.id;

        if (seekerId && hiderId) {
            question.same = seekerId === hiderId;
        } else {
            const [sLng, sLat] = turf.getCoord(seekerNearest);
            const [hLng, hLat] = turf.getCoord(hiderNearest);
            question.same = sLng === hLng && sLat === hLat;
        }

        question.matchingDebug = {
            seekerNearest:
                seekerNearest.properties?.name ??
                seekerNearest.properties?.id ??
                "Unknown",
            hiderNearest:
                hiderNearest.properties?.name ??
                hiderNearest.properties?.id ??
                "Unknown",
            same: question.same,
        };
        question.debug = question.matchingDebug;

        return maybeFreezeAndReturn();
    }

    if (
        question.type === "zone" ||
        question.type === "letter-zone" ||
        question.type === "suburb-zone" ||
        question.type === "federal-electorate-zone"
    ) {
        const adminLevel =
            question.type === "suburb-zone"
                ? 9
                : question.type === "federal-electorate-zone"
                  ? 6
                  : question.cat.adminLevel;

        const seekerBoundary = await findAdminBoundary(
            question.lat,
            question.lng,
            adminLevel,
        );
        const hiderBoundary = await findAdminBoundary(
            $hiderMode.latitude,
            $hiderMode.longitude,
            adminLevel,
        );

        question.matchingDebug = {
            adminLevel,
            seekerDetectedBoundary: boundaryName(seekerBoundary),
            hiderDetectedBoundary: boundaryName(hiderBoundary),
        };
        question.debug = question.matchingDebug;
    }

    if (question.type === "airport") {
        const airportData = await findPlacesInZone(
            '["aeroway"="aerodrome"]["iata"]',
            "Finding airports...",
            "nwr",
            "center",
        );

        if (airportData.elements?.length) {
            const airportPoints = turf.featureCollection(
                airportData.elements.map((x: any) =>
                    turf.point(
                        [
                            x.center ? x.center.lon : x.lon,
                            x.center ? x.center.lat : x.lat,
                        ],
                        {
                            name: x.tags?.["name:en"] ?? x.tags?.name,
                            iata: x.tags?.iata,
                        },
                    ),
                ),
            );

            const seekerNearestAirport = turf.nearestPoint(
                turf.point([question.lng, question.lat]),
                airportPoints as any,
            ) as any;
            const hiderNearestAirport = turf.nearestPoint(
                turf.point([$hiderMode.longitude, $hiderMode.latitude]),
                airportPoints as any,
            ) as any;

            const seekerName = seekerNearestAirport.properties?.name;
            const seekerIata = seekerNearestAirport.properties?.iata;
            const hiderName = hiderNearestAirport.properties?.name;
            const hiderIata = hiderNearestAirport.properties?.iata;

            question.matchingDebug = {
                seekerNearestAirport: seekerIata
                    ? `${seekerName ?? "Unknown"} (${seekerIata})`
                    : seekerName ?? "Unknown",
                hiderNearestAirport: hiderIata
                    ? `${hiderName ?? "Unknown"} (${hiderIata})`
                    : hiderName ?? "Unknown",
            };
            question.debug = question.matchingDebug;
        }
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
            const seekerStationName =
                nearestSeekerTrainStation.properties["name:en"] ||
                nearestSeekerTrainStation.properties.name ||
                "Unknown station";
            const hiderStationName =
                nearestHiderTrainStation.properties["name:en"] ||
                nearestHiderTrainStation.properties.name ||
                "Unknown station";

            const seekerLines = await sydneyRailLineRefsForStation(
                nearestSeekerTrainStation.properties.id,
            );
            const hiderLines = await sydneyRailLineRefsForStation(
                nearestHiderTrainStation.properties.id,
            );

            const manualRequired =
                seekerLines.length > 1 &&
                !SYDNEY_MANUAL_SELECTION_EXCLUDED_STATIONS.has(
                    normalizeStationName(seekerStationName),
                );
            const selectedLine =
                question.selectedSydneyTrainLine &&
                question.selectedSydneyTrainLine !== "AUTO" &&
                question.selectedSydneyTrainLine !== "UNSET"
                    ? question.selectedSydneyTrainLine
                    : null;

            const effectiveSeekerLines = selectedLine
                ? seekerLines.includes(selectedLine)
                    ? [selectedLine]
                    : []
                : seekerLines;

            question.same =
                (!manualRequired || !!selectedLine) &&
                effectiveSeekerLines.length > 0 &&
                hiderLines.length > 0 &&
                effectiveSeekerLines.some((line) => hiderLines.includes(line));

            question.sydneyLineOptions = seekerLines;
            question.sydneyLineStationName = seekerStationName;
            question.sydneyLineManualRequired = manualRequired;
            question.sydneyLineDebug = {
                seekerStationName,
                hiderStationName,
                seekerLines,
                hiderLines,
                effectiveSeekerLines,
                stationCountOnActiveLines: (
                    await sydneyStationPointsForLineRefs(effectiveSeekerLines)
                ).features.length,
                selectedLine: selectedLine ?? "AUTO",
                manualRequired,
                same: question.same,
            };
            question.debug = question.sydneyLineDebug;
        }

        const hiderEnglishName =
            nearestHiderTrainStation.properties["name:en"] ||
            nearestHiderTrainStation.properties.name;
        const seekerEnglishName =
            nearestSeekerTrainStation.properties["name:en"] ||
            nearestSeekerTrainStation.properties.name;

        if (!hiderEnglishName || !seekerEnglishName) {
            return maybeFreezeAndReturn();
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
            question.debug = {
                seekerStation: seekerEnglishName,
                hiderStation: hiderEnglishName,
                seekerFirstLetter: seekerEnglishName[0].toUpperCase(),
                hiderFirstLetter: hiderEnglishName[0].toUpperCase(),
                detectedResult: question.same ? "same" : "different",
            };
        } else if (question.type === "same-length-station") {
            if (hiderEnglishName.length === seekerEnglishName.length) {
                question.lengthComparison = "same";
            } else if (hiderEnglishName.length < seekerEnglishName.length) {
                question.lengthComparison = "shorter";
            } else {
                question.lengthComparison = "longer";
            }
            question.debug = {
                seekerStation: seekerEnglishName,
                hiderStation: hiderEnglishName,
                seekerLength: seekerEnglishName.length,
                hiderLength: hiderEnglishName.length,
                detectedResult: question.lengthComparison,
            };
        }

        return maybeFreezeAndReturn();
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return maybeFreezeAndReturn();

    let feature = null;

    try {
        feature = holedMask((await adjustPerMatching(question, $mapGeoJSON))!);
    } catch {
        try {
            feature = await adjustPerMatching(question, {
                type: "FeatureCollection",
                features: [holedMask($mapGeoJSON)],
            });
        } catch {
            return maybeFreezeAndReturn();
        }
    }

    if (feature === null || feature === undefined) {
        return maybeFreezeAndReturn();
    }

    const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

    if (turf.booleanPointInPolygon(hiderPoint, feature)) {
        question.same = !question.same;
    }

    return maybeFreezeAndReturn();
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
