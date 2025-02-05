import { hiderMode, questions } from "@/utils/context";
import { iconColors } from "./api";
import * as turf from "@turf/turf";
import type { LatLng } from "leaflet";
import { geoSpatialVoronoi } from "./voronoi";

export interface ThermometerQuestion {
    distance?: number;
    latA: number;
    lngA: number;
    latB: number;
    lngB: number;
    warmer: boolean;
    colorA?: keyof typeof iconColors;
    colorB?: keyof typeof iconColors;
    drag?: boolean;
}

export const adjustPerThermometer = (
    question: ThermometerQuestion,
    mapData: any,
    masked: boolean,
) => {
    if (mapData === null) return;
    if (masked) {
        throw new Error("Cannot be masked");
    }

    const pointA = turf.point([question.lngA, question.latA]);
    const pointB = turf.point([question.lngB, question.latB]);

    const voronoi = geoSpatialVoronoi(turf.featureCollection([pointA, pointB]));

    if (question.warmer) {
        return turf.intersect(
            turf.featureCollection(
                mapData.features.length > 1
                    ? [turf.union(mapData)!, voronoi.features[1]]
                    : [...mapData.features, voronoi.features[1]],
            ),
        );
    } else {
        return turf.intersect(
            turf.featureCollection(
                mapData.features.length > 1
                    ? [turf.union(mapData)!, voronoi.features[0]]
                    : [...mapData.features, voronoi.features[0]],
            ),
        );
    }
};

export const addDefaultThermometer = (center: LatLng) => {
    const destination = turf.destination([center.lng, center.lat], 5, 90, {
        units: "miles",
    });

    questions.set([
        ...questions.get(),
        {
            id: "thermometer",
            key: Math.random() * 1e9,
            data: {
                colorA: Object.keys(iconColors)[
                    Math.floor(Math.random() * Object.keys(iconColors).length)
                ] as keyof typeof iconColors,
                colorB: Object.keys(iconColors)[
                    Math.floor(Math.random() * Object.keys(iconColors).length)
                ] as keyof typeof iconColors,
                latA: center.lat,
                lngA: center.lng,
                latB: destination.geometry.coordinates[1],
                lngB: destination.geometry.coordinates[0],
                distance: 5,
                warmer: true,
                drag: true,
            },
        },
    ]);
};

export const hiderifyThermometer = (question: ThermometerQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const pointA = turf.point([question.lngA, question.latA]);
    const pointB = turf.point([question.lngB, question.latB]);

    const voronoi = geoSpatialVoronoi(turf.featureCollection([pointA, pointB]));

    const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);
    const hiderRegion = turf.booleanPointInPolygon(
        hiderPoint,
        voronoi.features[1],
    )
        ? 1
        : 0;

    if (hiderRegion === 1) {
        question.warmer = true;
    } else {
        question.warmer = false;
    }

    return question;
};
