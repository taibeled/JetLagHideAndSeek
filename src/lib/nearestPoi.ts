import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    LineString,
    MultiLineString,
    Point,
} from "geojson";

import { nearestToQuestion, QuestionSpecificLocation } from "@/maps/api";
import {
    findAirportPointsInPlayZone,
    findCityPointsInPlayZone,
    findHighSpeedRailFeatures,
    findHomeGamePoiPointsInPlayZone,
    findPlacesSpecificInZone,
} from "@/maps/api";
import { extractStationLabel, lngLatToText } from "@/maps/geo-utils";
import type {
    APILocations,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
    MatchingQuestion,
    MeasuringQuestion,
    Units,
} from "@/maps/schema";

type NamedPoint = Feature<Point, Record<string, any>>;

export type NearestPoiResult =
    | {
          status: "found";
          category: string;
          name: string;
          distance?: {
              value: number;
              unit: Units;
              label: string;
              text: string;
          };
      }
    | {
          status: "unsupported" | "unavailable" | "error";
      };

const HOME_GAME_POI_TYPES = [
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
] as const;

const isHomeGamePoiType = (type: string): type is APILocations =>
    (HOME_GAME_POI_TYPES as readonly string[]).includes(type);

const fullPoiLocation = (type: string): APILocations | null => {
    if (!type.endsWith("-full")) return null;
    const location = type.slice(0, -"-full".length);
    return isHomeGamePoiType(location) ? location : null;
};

const coordinateFallback = (feature: Feature<Point>) =>
    lngLatToText(feature.geometry.coordinates as [number, number]);

export const pointDisplayName = (feature: Feature<Point>): string => {
    const props = feature.properties as Record<string, any> | null;
    const name =
        props?.["name:en"] ??
        props?.name ??
        (Array.isArray(props?.memberNames) ? props.memberNames[0] : undefined);
    return typeof name === "string" && name.trim()
        ? name
        : coordinateFallback(feature);
};

export const nearestNamedPoint = (
    lat: number,
    lng: number,
    points: FeatureCollection<Point> | Feature<Point>[],
): string | null => {
    return nearestPointDetails(lat, lng, points)?.name ?? null;
};

type NearestPointDetails = {
    name: string;
    point: Feature<Point>;
};

const nearestPointDetails = (
    lat: number,
    lng: number,
    points: FeatureCollection<Point> | Feature<Point>[],
): NearestPointDetails | null => {
    const features = Array.isArray(points) ? points : points.features;
    if (features.length === 0) return null;
    const origin = turf.point([lng, lat]);
    const nearest = turf.nearestPoint(
        origin,
        turf.featureCollection(features as NamedPoint[]),
    ) as Feature<Point>;
    return {
        name: pointDisplayName(nearest),
        point: nearest,
    };
};
type DistanceDetails = {
    value: number;
    unit: Units;
    label: string;
    text: string;
};

const unitLabels: Record<Units, string> = {
    miles: "mi",
    kilometers: "km",
    meters: "m",
};

export function formatDistance(value: number, unit: Units): string {
    if (unit === "meters") return `${Math.round(value)} ${unitLabels[unit]}`;
    const rounded = value < 10 ? value.toFixed(2) : value.toFixed(1);
    return `${rounded} ${unitLabels[unit]}`;
}

const distanceDetails = (value: number, unit: Units): DistanceDetails => ({
    value,
    unit,
    label: unitLabels[unit],
    text: formatDistance(value, unit),
});

const isLineFeature = (
    feature: Feature,
): feature is Feature<LineString | MultiLineString> =>
    feature.geometry?.type === "LineString" ||
    feature.geometry?.type === "MultiLineString";

const toLineStrings = (
    feature: Feature<LineString | MultiLineString>,
): Feature<LineString>[] => {
    if (feature.geometry.type === "LineString") {
        return [feature as Feature<LineString>];
    }
    return feature.geometry.coordinates.map((coordinates) =>
        turf.lineString(coordinates, feature.properties ?? undefined),
    );
};

export const nearestLineDistance = (
    lat: number,
    lng: number,
    features: Feature[],
    unit: Units,
): DistanceDetails | null => {
    const lineFeatures = features.filter(isLineFeature);
    if (lineFeatures.length === 0) return null;

    const point = turf.point([lng, lat]);
    const distances = lineFeatures
        .flatMap(toLineStrings)
        .filter((feature) => feature.geometry.coordinates.length >= 2)
        .map((feature) =>
            turf.pointToLineDistance(point, feature, {
                units: unit,
                method: "geodesic",
            }),
        );

    if (distances.length === 0) return null;
    return distanceDetails(Math.min(...distances), unit);
};

const findHomeGameNearestDetails = async (
    question: HomeGameMatchingQuestions | HomeGameMeasuringQuestions,
): Promise<NearestPointDetails> => {
    const point = (await nearestToQuestion(question)) as Feature<Point>;
    return {
        name: pointDisplayName(point),
        point,
    };
};

export const matchingNearestPoiCategory = (
    type: MatchingQuestion["type"],
): string | null => {
    if (type === "airport") return "airport";
    if (type === "major-city") return "city";
    if (type === "custom-points") return "custom point";
    if (isHomeGamePoiType(type)) return "POI";
    if (fullPoiLocation(type)) return "POI";
    if (
        type === "same-first-letter-station" ||
        type === "same-length-station" ||
        type === "same-train-line"
    ) {
        return "station";
    }
    return null;
};

export const measuringNearestPoiCategory = (
    type: MeasuringQuestion["type"],
): string | null => {
    if (type === "airport") return "airport";
    if (type === "city") return "city";
    if (type === "highspeed-measure-shinkansen") return "high-speed rail";
    if (type === "custom-measure") return "custom point";
    if (type === "rail-measure") return "station";
    if (type === "mcdonalds") return "McDonald's";
    if (type === "seven11") return "7-Eleven";
    if (isHomeGamePoiType(type)) return "POI";
    if (fullPoiLocation(type)) return "POI";
    return null;
};

export async function resolveMatchingNearestPoi(
    question: MatchingQuestion,
    stationPoints: Feature<Point>[] = [],
): Promise<NearestPoiResult> {
    const category = matchingNearestPoiCategory(question.type);
    if (!category) return { status: "unsupported" };

    try {
        let name: string | null = null;

        if (question.type === "airport") {
            name = nearestNamedPoint(
                question.lat,
                question.lng,
                await findAirportPointsInPlayZone(),
            );
        } else if (question.type === "major-city") {
            name = nearestNamedPoint(
                question.lat,
                question.lng,
                await findCityPointsInPlayZone(),
            );
        } else if (question.type === "custom-points") {
            name = nearestNamedPoint(
                question.lat,
                question.lng,
                (question.geo ?? []) as Feature<Point>[],
            );
        } else if (isHomeGamePoiType(question.type)) {
            name = (
                await findHomeGameNearestDetails(
                    question as HomeGameMatchingQuestions,
                )
            ).name;
        } else {
            const fullLocation = fullPoiLocation(question.type);
            if (fullLocation) {
                name = nearestNamedPoint(
                    question.lat,
                    question.lng,
                    (await findHomeGamePoiPointsInPlayZone(
                        fullLocation,
                    )) as FeatureCollection<Point>,
                );
            } else if (stationPoints.length > 0) {
                const nearest = turf.nearestPoint(
                    turf.point([question.lng, question.lat]),
                    turf.featureCollection(stationPoints as NamedPoint[]),
                );
                name = extractStationLabel(nearest);
            }
        }

        return name
            ? { status: "found", category, name }
            : { status: "unavailable" };
    } catch {
        return { status: "error" };
    }
}

export async function resolveMeasuringNearestPoi(
    question: MeasuringQuestion,
    stationPoints: Feature<Point>[] = [],
    unit: Units = "miles",
): Promise<NearestPoiResult> {
    const category = measuringNearestPoiCategory(question.type);
    if (!category) return { status: "unsupported" };

    try {
        let name: string | null = null;
        let nearestPoint: Feature<Point> | null = null;
        const setNearest = (details: NearestPointDetails | null) => {
            name = details?.name ?? null;
            nearestPoint = details?.point ?? null;
        };

        if (question.type === "airport") {
            setNearest(
                nearestPointDetails(
                    question.lat,
                    question.lng,
                    await findAirportPointsInPlayZone(),
                ),
            );
        } else if (question.type === "city") {
            setNearest(
                nearestPointDetails(
                    question.lat,
                    question.lng,
                    await findCityPointsInPlayZone(),
                ),
            );
        } else if (question.type === "highspeed-measure-shinkansen") {
            const distance = nearestLineDistance(
                question.lat,
                question.lng,
                await findHighSpeedRailFeatures(),
                unit,
            );
            if (distance) {
                name = "High-speed rail";
                return {
                    status: "found",
                    category,
                    name,
                    distance,
                };
            }
        } else if (question.type === "custom-measure") {
            const features = question.geo?.features?.filter(
                (feature: Feature): feature is Feature<Point> =>
                    feature.geometry?.type === "Point",
            );
            setNearest(
                nearestPointDetails(question.lat, question.lng, features ?? []),
            );
        } else if (question.type === "rail-measure") {
            if (stationPoints.length > 0) {
                const nearest = turf.nearestPoint(
                    turf.point([question.lng, question.lat]),
                    turf.featureCollection(stationPoints as NamedPoint[]),
                ) as Feature<Point>;
                name = extractStationLabel(nearest);
                nearestPoint = nearest;
            }
        } else if (question.type === "mcdonalds") {
            setNearest(
                nearestPointDetails(
                    question.lat,
                    question.lng,
                    await findPlacesSpecificInZone(
                        QuestionSpecificLocation.McDonalds,
                    ),
                ),
            );
        } else if (question.type === "seven11") {
            setNearest(
                nearestPointDetails(
                    question.lat,
                    question.lng,
                    await findPlacesSpecificInZone(
                        QuestionSpecificLocation.Seven11,
                    ),
                ),
            );
        } else if (isHomeGamePoiType(question.type)) {
            setNearest(
                await findHomeGameNearestDetails(
                    question as HomeGameMeasuringQuestions,
                ),
            );
        } else {
            const fullLocation = fullPoiLocation(question.type);
            if (fullLocation) {
                setNearest(
                    nearestPointDetails(
                        question.lat,
                        question.lng,
                        (await findHomeGamePoiPointsInPlayZone(
                            fullLocation,
                        )) as FeatureCollection<Point>,
                    ),
                );
            }
        }

        return name
            ? {
                  status: "found",
                  category,
                  name,
                  distance: nearestPoint
                      ? distanceDetails(
                            turf.distance(
                                turf.point([question.lng, question.lat]),
                                nearestPoint,
                                {
                                    units: unit,
                                },
                            ),
                            unit,
                        )
                      : undefined,
              }
            : { status: "unavailable" };
    } catch {
        return { status: "error" };
    }
}
