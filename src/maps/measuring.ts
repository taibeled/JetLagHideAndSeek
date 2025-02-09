import { fetchCoastline, findPlacesInZone, iconColors } from "./api";
import * as turf from "@turf/turf";
import _ from "lodash";
import type {
    Feature,
    GeoJsonProperties,
    MultiPolygon,
    Polygon,
} from "geojson";
import { hiderMode, mapGeoJSON, questions } from "@/lib/context";
import type { LatLng } from "leaflet";
import { holedMask, unionize } from "./geo-utils";

export interface BaseMeasuringQuestion {
    lat: number;
    lng: number;
    hiderCloser: boolean;
    color?: keyof typeof iconColors;
    drag?: boolean;
}

export interface CoastlineMeasuringQuestion extends BaseMeasuringQuestion {
    type: "coastline";
}

export interface AirportMeasuringQuestion extends BaseMeasuringQuestion {
    type: "airport";
}

export interface CityMeasuringQuestion extends BaseMeasuringQuestion {
    type: "city";
}

export interface McDonaldsMeasuringQuestion extends BaseMeasuringQuestion {
    type: "mcdonalds";
}

export interface Seven11MeasuringQuestion extends BaseMeasuringQuestion {
    type: "seven11";
}

export type MeasuringQuestion =
    | CoastlineMeasuringQuestion
    | AirportMeasuringQuestion
    | CityMeasuringQuestion
    | McDonaldsMeasuringQuestion
    | Seven11MeasuringQuestion;

export const adjustPerMeasuring = async (
    question: MeasuringQuestion,
    mapData: any,
    masked: boolean,
) => {
    if (mapData === null) return;

    const bBox = turf.bbox(mapGeoJSON.get());

    let placeDataFull;

    switch (question.type) {
        case "coastline": {
            if (question.hiderCloser && !masked)
                throw new Error("Must be masked");

            if (!question.hiderCloser && masked)
                throw new Error("Cannot be masked");

            const coastline = turf.lineToPolygon(
                await fetchCoastline(),
            ) as Feature<MultiPolygon>;

            const distanceToCoastline = turf.pointToPolygonDistance(
                turf.point([question.lng, question.lat]),
                coastline,
                {
                    units: "miles",
                    method: "geodesic",
                },
            );

            const buffed = turf.buffer(
                turf.bboxClip(coastline, bBox ? bBox : [-180, -90, 180, 90]),
                distanceToCoastline,
                {
                    units: "miles",
                    steps: 64,
                },
            );

            if (question.hiderCloser) {
                return turf.union(
                    turf.featureCollection([...mapData.features, buffed]),
                );
            } else {
                return turf.intersect(
                    turf.featureCollection([unionize(mapData)!, buffed!]),
                );
            }
        }
        case "airport":
            if (question.hiderCloser && masked)
                throw new Error("Cannot be masked");

            if (!question.hiderCloser && !masked)
                throw new Error("Must be masked");
            placeDataFull = _.uniqBy(
                (
                    await findPlacesInZone(
                        '["aeroway"="aerodrome"]["iata"]', // Only commercial airports have IATA codes,
                        "Finding airports...",
                    )
                ).elements,
                (feature: any) => feature.tags.iata,
            );
            break;
        case "city":
            if (question.hiderCloser && masked)
                throw new Error("Cannot be masked");

            if (!question.hiderCloser && !masked)
                throw new Error("Must be masked");
            placeDataFull = (
                await findPlacesInZone(
                    '[place=city]["population"~"^[1-9]+[0-9]{6}$"]', // The regex is faster than (if:number(t["population"])>1000000)
                    "Finding cities...",
                )
            ).elements;
            break;
        case "mcdonalds":
            if (question.hiderCloser && masked)
                throw new Error("Cannot be masked");

            if (!question.hiderCloser && !masked)
                throw new Error("Must be masked");

            placeDataFull = (
                await findPlacesInZone(
                    '["brand:wikidata"="Q38076"]',
                    "Finding McDonald's...",
                )
            ).elements;

            break;
        case "seven11":
            if (question.hiderCloser && masked)
                throw new Error("Cannot be masked");

            if (!question.hiderCloser && !masked)
                throw new Error("Must be masked");

            placeDataFull = (
                await findPlacesInZone(
                    '["brand:wikidata"="Q259340"]',
                    "Finding 7-Elevens...",
                )
            ).elements;

            break;
    }

    if (placeDataFull) {
        if (question.hiderCloser && masked) throw new Error("Cannot be masked");

        if (!question.hiderCloser && !masked) throw new Error("Must be masked");

        const placeData = turf.featureCollection(
            placeDataFull.map((x: any) =>
                turf.point([
                    x.center ? x.center.lon : x.lon,
                    x.center ? x.center.lat : x.lat,
                ]),
            ),
        );

        const point = turf.point([question.lng, question.lat]);
        const closestPoint = turf.nearestPoint(point, placeData as any);
        const distance = turf.distance(point, closestPoint, {
            units: "miles",
        });

        const circles: Feature<Polygon, GeoJsonProperties>[] = [];

        placeData.features.forEach((feature: any) => {
            const circle = turf.circle(feature, distance, {
                units: "miles",
                steps: placeData.features.length > 1000 ? 16 : 64,
            });
            circles.push(circle);
        });

        let unionCircles;

        if (circles.length > 1) {
            unionCircles = turf.union(turf.featureCollection(circles));
        } else {
            unionCircles = circles[0];
        }

        if (question.hiderCloser) {
            if (!unionCircles) return null;

            return turf.intersect(
                turf.featureCollection(
                    mapData.features.length > 1
                        ? [turf.union(mapData)!, unionCircles]
                        : [...mapData.features, unionCircles],
                ),
            );
        } else {
            return turf.union(
                turf.featureCollection([...mapData.features, unionCircles]),
            );
        }
    }
};

export const addDefaultMeasuring = (center: LatLng) => {
    questions.set([
        ...questions.get(),
        {
            id: "measuring",
            key: Math.random() * 1e9,
            data: {
                color: Object.keys(iconColors)[
                    Math.floor(Math.random() * Object.keys(iconColors).length)
                ] as keyof typeof iconColors,
                lat: center.lat,
                lng: center.lng,
                drag: true,
                hiderCloser: true,
                type: "coastline",
            },
        },
    ]);
};

export const hiderifyMeasuring = async (question: MeasuringQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    let feature = null;

    try {
        feature = holedMask(
            (await adjustPerMeasuring(question, $mapGeoJSON, false))!,
        );
    } catch {
        feature = await adjustPerMeasuring(
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
        question.hiderCloser = !question.hiderCloser;
    }

    return question;
};
