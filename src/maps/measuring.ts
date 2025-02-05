import { fetchCoastline, findPlacesInZone, iconColors } from "./api";
import * as turf from "@turf/turf";
import _ from "lodash";
import type {
    Feature,
    GeoJsonProperties,
    MultiPolygon,
    Polygon,
} from "geojson";
import { hiderMode, mapGeoJSON, questions } from "@/utils/context";
import type { LatLng } from "leaflet";

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

export type MeasuringQuestion =
    | CoastlineMeasuringQuestion
    | AirportMeasuringQuestion;

export const adjustPerMeasuring = async (
    question: MeasuringQuestion,
    mapData: any,
    masked: boolean,
) => {
    if (mapData === null) return;

    const bBox = turf.bbox(mapGeoJSON.get());

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
                    turf.featureCollection(
                        mapData.features.length > 1
                            ? [turf.union(mapData)!, buffed]
                            : [...mapData.features, buffed],
                    ),
                );
            }
        }
        case "airport": {
            if (question.hiderCloser && masked)
                throw new Error("Cannot be masked");

            if (!question.hiderCloser && !masked)
                throw new Error("Must be masked");

            const airportDataFull = await findPlacesInZone(
                '["aeroway"="aerodrome"]["iata"]', // Only commercial airports have IATA codes
            );
            const airportDataUnique = _.uniqBy(
                airportDataFull.elements,
                (feature: any) => feature.tags.iata,
            );
            const airportData = turf.featureCollection(
                airportDataUnique.map((x) =>
                    turf.point([
                        x.center ? x.center.lon : x.lon,
                        x.center ? x.center.lat : x.lat,
                    ]),
                ),
            );

            const point = turf.point([question.lng, question.lat]);
            const closestPoint = turf.nearestPoint(point, airportData);
            const distance = turf.distance(point, closestPoint, {
                units: "miles",
            });

            const circles: Feature<Polygon, GeoJsonProperties>[] = [];

            airportData.features.forEach((feature: any) => {
                const circle = turf.circle(feature, distance, {
                    units: "miles",
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
        feature = turf.mask(
            (await adjustPerMeasuring(question, $mapGeoJSON, false))!,
        );
    } catch {
        feature = await adjustPerMeasuring(
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
        question.hiderCloser = !question.hiderCloser;
    }

    return question;
};
