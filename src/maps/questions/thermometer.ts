import * as turf from "@turf/turf";

import { hiderMode } from "@/lib/context";
import { safeUnion } from "@/maps/geo-utils";
import { geoSpatialVoronoi } from "@/maps/geo-utils/voronoi";
import type { ThermometerQuestion } from "@/maps/schema";

/**
 * Two-cell Voronoi split between the thermometer's start and end points:
 * cell 0 is the "colder" half, cell 1 the "warmer" half.
 */
const thermometerVoronoi = (question: ThermometerQuestion) =>
    geoSpatialVoronoi(
        turf.featureCollection([
            turf.point([question.lngA, question.latA]),
            turf.point([question.lngB, question.latB]),
        ]),
    );

export const adjustPerThermometer = (
    question: ThermometerQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    const voronoi = thermometerVoronoi(question);

    if (question.warmer) {
        return turf.intersect(
            turf.featureCollection([safeUnion(mapData), voronoi.features[1]]),
        );
    } else {
        return turf.intersect(
            turf.featureCollection([safeUnion(mapData), voronoi.features[0]]),
        );
    }
};

export const hiderifyThermometer = (question: ThermometerQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const voronoi = thermometerVoronoi(question);

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
    const voronoi = thermometerVoronoi(question);

    return turf.featureCollection(
        voronoi.features
            .map((x: any) => turf.polygonToLine(x))
            .flatMap((line) =>
                line.type === "FeatureCollection" ? line.features : [line],
            ),
    );
};
