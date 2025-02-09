import { hiderMode, mapGeoJSON, questions } from "@/lib/context";
import {
    findAdminBoundary,
    findPlacesInZone,
    iconColors,
    trainLineNodeFinder,
} from "./api";
import * as turf from "@turf/turf";
import type { LatLng } from "leaflet";
import _ from "lodash";
import { geoSpatialVoronoi } from "./voronoi";
import { toast } from "react-toastify";
import osmtogeojson from "osmtogeojson";
import { holedMask, unionize } from "./geo-utils";

export interface MatchingZoneQuestion {
    adminLevel: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
}

export interface BaseMatchingQuestion {
    lat: number;
    lng: number;
    same: boolean;
    color?: keyof typeof iconColors;
    drag?: boolean;
}

export interface ZoneMatchingQuestion extends BaseMatchingQuestion {
    type: "zone";
    cat: MatchingZoneQuestion;
}

export interface AirportMatchingQuestion extends BaseMatchingQuestion {
    type: "airport";
}

export interface MajorCityMatchingQuestion extends BaseMatchingQuestion {
    type: "major-city";
}

export interface SameFirstLetterStationMatchingQuestion
    extends BaseMatchingQuestion {
    type: "same-first-letter-station";
}

export interface SameLengthStationMatchingQuestion
    extends BaseMatchingQuestion {
    type: "same-length-station";
}

export interface SameTrainLineMatchingQuestion extends BaseMatchingQuestion {
    type: "same-train-line";
}

export interface LetterMatchingZoneQuestion extends BaseMatchingQuestion {
    type: "letter-zone";
    cat: MatchingZoneQuestion;
}

export type MatchingQuestion =
    | ZoneMatchingQuestion
    | AirportMatchingQuestion
    | LetterMatchingZoneQuestion
    | MajorCityMatchingQuestion
    | SameFirstLetterStationMatchingQuestion
    | SameLengthStationMatchingQuestion
    | SameTrainLineMatchingQuestion;

export const adjustPerMatching = async (
    question: MatchingQuestion,
    mapData: any,
    masked: boolean,
) => {
    if (mapData === null) return;

    if (question.same && masked) {
        throw new Error("Cannot be masked");
    } else if (!question.same && !masked) {
        throw new Error("Must be masked");
    }

    let boundary;

    switch (question.type) {
        case "same-first-letter-station": {
            return mapData;
        }
        case "same-length-station": {
            return mapData;
        }
        case "same-train-line": {
            return mapData;
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
                        `[admin_level=${question.cat.adminLevel}]["name"~"^${letter}.+"]`, // Regex is faster than filtering afterward
                    ),
                ).features.filter(
                    (x) =>
                        x.geometry &&
                        (x.geometry.type === "Polygon" ||
                            x.geometry.type === "MultiPolygon"),
                ),
            );

            // It's either simplify or crash. Technically this could be bad if someone's hiding zone was inside multiple zones, but that's unlikely.
            boundary = unionize(
                turf.simplify(boundary, {
                    tolerance: 0.001,
                    highQuality: true,
                    mutate: true,
                }) as any,
            );

            break;
        }
        case "airport": {
            const airportData = _.uniqBy(
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

            const voronoi = geoSpatialVoronoi(airportData);
            const point = turf.point([question.lng, question.lat]);

            for (const feature of voronoi.features) {
                if (turf.booleanPointInPolygon(point, feature)) {
                    boundary = feature;
                    break;
                }
            }
            break;
        }
        case "major-city": {
            const cityData = (
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

            const voronoi = geoSpatialVoronoi(cityData);
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

    if (question.same) {
        return turf.intersect(
            turf.featureCollection([unionize(mapData), boundary]),
        );
    } else {
        return turf.union(
            turf.featureCollection([...mapData.features, boundary]),
        );
    }
};

export const addDefaultMatching = (center: LatLng) => {
    questions.set([
        ...questions.get(),
        {
            id: "matching",
            key: Math.random() * 1e9,
            data: {
                color: Object.keys(iconColors)[
                    Math.floor(Math.random() * Object.keys(iconColors).length)
                ] as keyof typeof iconColors,
                lat: center.lat,
                lng: center.lng,
                drag: true,
                same: true,
                type: "zone",
                cat: {
                    adminLevel: 3,
                },
            },
        },
    ]);
};

export const hiderifyMatching = async (question: MatchingQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
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
        );

        const nearestHiderTrainStation = turf.nearestPoint(
            hiderPoint,
            places as any,
        );
        const nearestSeekerTrainStation = turf.nearestPoint(
            seekerPoint,
            places as any,
        );

        if (question.type === "same-train-line") {
            const nodes = await trainLineNodeFinder(
                nearestSeekerTrainStation.properties.id,
            );

            const hiderId = parseInt(
                nearestHiderTrainStation.properties.id.split("/")[1],
            );

            if (nodes.includes(hiderId)) {
                question.same = true;
            } else {
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
                question.same = true;
            } else {
                question.same = false;
            }
        }

        return question;
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    let feature = null;

    try {
        feature = holedMask(
            (await adjustPerMatching(question, $mapGeoJSON, false))!,
        );
    } catch {
        feature = await adjustPerMatching(
            question,
            {
                type: "FeatureCollection",
                features: [holedMask($mapGeoJSON)],
            },
            true,
        );
    }

    if (feature === null || feature === undefined) return question;

    const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

    if (turf.booleanPointInPolygon(hiderPoint, feature)) {
        question.same = !question.same;
    }

    return question;
};
