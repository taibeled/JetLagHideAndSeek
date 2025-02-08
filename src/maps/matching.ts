import { hiderMode, mapGeoJSON, questions } from "@/utils/context";
import { findAdminBoundary, findPlacesInZone, iconColors } from "./api";
import * as turf from "@turf/turf";
import type { LatLng } from "leaflet";
import _ from "lodash";
import { geoSpatialVoronoi } from "./voronoi";
import { toast } from "react-toastify";
import osmtogeojson from "osmtogeojson";

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

export interface LetterMatchingZoneQuestion extends BaseMatchingQuestion {
    type: "letter-zone";
    cat: MatchingZoneQuestion;
}

export type MatchingQuestion =
    | ZoneMatchingQuestion
    | AirportMatchingQuestion
    | LetterMatchingZoneQuestion;

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
        case "zone": {
            boundary = await findAdminBoundary(
                question.lat,
                question.lng,
                question.cat.adminLevel,
            );
            break;
        }
        case "letter-zone": {
            const zone = await findAdminBoundary(
                question.lat,
                question.lng,
                question.cat.adminLevel,
            );

            const englishName = zone.properties?.["name:en"];

            if (!englishName) {
                toast.error("No English name found for this zone");
                throw new Error("No English name");
            }

            const letter = englishName[0].toUpperCase();

            boundary = turf.featureCollection(
                osmtogeojson(
                    await findPlacesInZone(
                        `[admin_level=${question.cat.adminLevel}]["name:en"~"^${letter}.+"]`, // Regex is faster than filtering afterward
                        `Finding zones that start with the same letter (${letter})...`,
                        "relation",
                        "geom",
                    ),
                ).features.filter(
                    (x) =>
                        x.geometry &&
                        (x.geometry.type === "Polygon" ||
                            x.geometry.type === "MultiPolygon"),
                ),
            );

            if (boundary.features.length > 1) {
                boundary = turf.union(boundary as any);
            }

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
        }
    }

    if (question.same) {
        return turf.intersect(
            turf.featureCollection(
                mapData.features.length > 1
                    ? [turf.union(mapData)!, boundary]
                    : [...mapData.features, boundary],
            ),
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

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    let feature = null;

    try {
        feature = turf.mask(
            (await adjustPerMatching(question, $mapGeoJSON, false))!,
        );
    } catch {
        feature = await adjustPerMatching(
            question,
            {
                type: "FeatureCollection",
                features: [turf.mask($mapGeoJSON)],
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
