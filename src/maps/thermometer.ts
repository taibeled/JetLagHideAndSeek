import * as turf from "@turf/turf";

import { hiderMode } from "@/lib/context";
import type { ThermometerQuestion } from "@/maps/schema";

import { unionize } from "./geo-utils";
import { geoSpatialVoronoi } from "./voronoi";

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
            turf.featureCollection([unionize(mapData), voronoi.features[1]]),
        );
    } else {
        return turf.intersect(
            turf.featureCollection([unionize(mapData), voronoi.features[0]]),
        );
    }
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

export const thermometerPlanningPolygon = (question: ThermometerQuestion) => {
    const pointA = turf.point([question.lngA, question.latA]);
    const pointB = turf.point([question.lngB, question.latB]);

    const voronoi = geoSpatialVoronoi(turf.featureCollection([pointA, pointB]));

    return turf.featureCollection(
        voronoi.features.map((x: any) => turf.polygonToLine(x)),
    );
};
