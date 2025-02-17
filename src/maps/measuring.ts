import {
    fetchCoastline,
    findPlacesInZone,
    findPlacesSpecificInZone,
    iconColors,
    nearestToQuestion,
    QuestionSpecificLocation,
} from "./api";
import * as turf from "@turf/turf";
import _ from "lodash";
import type {
    Feature,
    GeoJsonProperties,
    MultiPolygon,
    Polygon,
} from "geojson";
import {
    hiderMode,
    mapGeoJSON,
    mapGeoLocation,
    questions,
    trainStations,
} from "@/lib/context";
import type { LatLng } from "leaflet";
import {
    groupObjects,
    holedMask,
    nearestNeighborSort,
    unionize,
} from "./geo-utils";
import osmtogeojson from "osmtogeojson";

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

export interface RailStationMeasuringQuestion extends BaseMeasuringQuestion {
    type: "rail-measure";
}

export interface DistanceToHighSpeedRail extends BaseMeasuringQuestion {
    type: "highspeed-measure-shinkansen";
}

export interface HomeGameMeasuringQuestions extends BaseMeasuringQuestion {
    type:
        | "aquarium"
        | "zoo"
        | "theme_park"
        | "museum"
        | "hospital"
        | "cinema"
        | "library"
        | "golf_course"
        | "consulate"
        | "park";
}

export type MeasuringQuestion =
    | CoastlineMeasuringQuestion
    | AirportMeasuringQuestion
    | CityMeasuringQuestion
    | McDonaldsMeasuringQuestion
    | Seven11MeasuringQuestion
    | RailStationMeasuringQuestion
    | HomeGameMeasuringQuestions
    | DistanceToHighSpeedRail;

const highSpeedBase = _.memoize(
    (features: Feature[], point: [number, number]) => {
        const grouped = groupObjects(features);

        const neighbored = grouped.map((group) => {
            const points = turf.coordAll(turf.featureCollection(group)) as [
                number,
                number,
            ][];

            return turf.multiLineString(
                nearestNeighborSort(
                    points.filter(
                        (_, index) =>
                            index % Math.ceil(points.length / 1000) === 0, // More than a thousand points is slow and just unneeded accuracy
                    ),
                ),
            );
        });

        const sampleBuff = turf.union(
            turf.featureCollection(
                neighbored.map((x) => turf.buffer(x, 0.001)!),
            ),
        )!;
        const distanceToSampleBuff = turf.pointToPolygonDistance(
            point,
            sampleBuff,
            {
                method: "geodesic",
            },
        );

        return turf.buffer(sampleBuff, distanceToSampleBuff - 0.001);
    },
    (features, point) =>
        `${features.length},${mapGeoLocation.get().properties.osm_id},${point.join(",")}`,
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

export const adjustPerMeasuring = async (
    question: MeasuringQuestion,
    mapData: any,
    masked: boolean,
) => {
    if (mapData === null) return;

    const bBox = turf.bbox(mapGeoJSON.get());

    let placeDataFull;

    switch (question.type) {
        case "highspeed-measure-shinkansen": {
            if (question.hiderCloser && masked)
                throw new Error("Cannot be masked");
            if (!question.hiderCloser && !masked)
                throw new Error("Must be masked");

            const features = osmtogeojson(
                await findPlacesInZone(
                    "[highspeed=yes]",
                    "Finding high-speed lines...",
                    "way",
                    "geom",
                ),
            ).features;

            const buffed = highSpeedBase(features, [
                question.lng,
                question.lat,
            ]);

            if (question.hiderCloser) {
                return turf.intersect(
                    turf.featureCollection([unionize(mapData)!, buffed!]),
                );
            } else {
                return turf.union(
                    turf.featureCollection([...mapData.features, buffed!]),
                );
            }
        }
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

            const originalBuffed = turf.buffer(
                turf.bboxClip(
                    coastline,
                    bBox
                        ? bboxExtension(bBox as any, distanceToCoastline)
                        : [-180, -90, 180, 90],
                ),
                distanceToCoastline,
                {
                    units: "miles",
                    steps: 64,
                },
            )!;

            const buffed = turf.buffer(
                originalBuffed,
                turf.pointToPolygonDistance(
                    turf.point([question.lng, question.lat]),
                    originalBuffed!,
                    { units: "miles", method: "geodesic" },
                ),
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
        case "aquarium":
        case "zoo":
        case "theme_park":
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
            return mapData;
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

    if (
        [
            "aquarium",
            "zoo",
            "theme_park",
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
            question as HomeGameMeasuringQuestions,
        );
        const hiderNearest = await nearestToQuestion({
            lat: $hiderMode.latitude,
            lng: $hiderMode.longitude,
            hiderCloser: true,
            type: (question as HomeGameMeasuringQuestions).type,
        });

        question.hiderCloser =
            questionNearest.properties.distanceToPoint >
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
            turf.featureCollection(stations.map((x) => x.properties.geometry)),
        );

        const distance = turf.distance(location, nearestTrainStation);

        const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

        const hiderNearest = turf.nearestPoint(
            hider,
            turf.featureCollection(stations.map((x) => x.properties.geometry)),
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
