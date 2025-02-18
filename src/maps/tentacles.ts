import { findTentacleLocations } from "./api";
import * as turf from "@turf/turf";
import { hiderMode } from "@/lib/context";
import { geoSpatialVoronoi } from "./voronoi";
import { unionize } from "./geo-utils";
import type { TentacleQuestion } from "@/lib/schema";

export const adjustPerTentacle = async (
    question: TentacleQuestion,
    mapData: any,
    masked: boolean,
) => {
    if (mapData === null) return;
    if (masked) {
        throw new Error("Cannot be masked");
    }
    if (question.location === false) {
        throw new Error("Must have a location");
    }

    const points = await findTentacleLocations(question);

    const voronoi = geoSpatialVoronoi(points);

    const correctPolygon = voronoi.features.find((feature: any) => {
        if (!question.location) return false;
        return (
            feature.properties.site.properties.name ===
            question.location.properties.name
        );
    });
    if (!correctPolygon) {
        return mapData;
    }

    const circle = turf.circle(
        turf.point([question.lng, question.lat]),
        question.radius,
        {
            units: question.unit,
        },
    );

    return turf.intersect(
        turf.featureCollection([unionize(mapData)!, correctPolygon, circle]),
    );
};

export const hiderifyTentacles = async (question: TentacleQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const points = await findTentacleLocations(question);

    const voronoi = geoSpatialVoronoi(points);

    const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);
    const location = turf.point([question.lng, question.lat]);

    if (
        turf.distance(hider, location, { units: question.unit }) >
        question.radius
    ) {
        question.location = false;
        return question;
    }

    let correctLocation: any = null;

    const correctPolygon = voronoi.features.find(
        (feature: any, index: number) => {
            const pointIn =
                turf.booleanPointInPolygon(hider, feature.geometry) || false;

            if (pointIn) {
                correctLocation = points.features[index];
            }
            return pointIn;
        },
    );

    if (!correctPolygon) {
        return question;
    }

    question.location = correctLocation!;
    return question;
};
