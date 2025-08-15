import * as turf from "@turf/turf";

import { hiderMode } from "@/lib/context";
import { findTentacleLocations } from "@/maps/api";
import { arcBuffer, safeUnion } from "@/maps/geo-utils";
import { geoSpatialVoronoi } from "@/maps/geo-utils";
import type { TentacleQuestion, Units } from "@/maps/schema";

const filterPointsWithinRadius = (
    points: any,
    centerLng: number,
    centerLat: number,
    radius: number,
    unit: Units,
) => {
    if (
        centerLng === null ||
        centerLat === null ||
        radius === undefined ||
        radius === null
    ) {
        return points;
    }
    const center = turf.point([centerLng, centerLat]);

    return turf.featureCollection(
        points.features.filter((feature: any) => {
            const coords =
                feature?.geometry?.coordinates ??
                (feature?.properties?.lon && feature?.properties?.lat
                    ? [feature.properties.lon, feature.properties.lat]
                    : null);

            if (!coords) return false;

            const pt = turf.point(coords);
            const dist = turf.distance(center, pt, { units: unit });
            return dist <= radius;
        }),
    );
};

export const adjustPerTentacle = async (
    question: TentacleQuestion,
    mapData: any,
) => {
    if (mapData === null) return;
    if (question.location === false) {
        throw new Error("Must have a location");
    }

    const rawPoints =
        question.locationType === "custom"
            ? turf.featureCollection(question.places)
            : await findTentacleLocations(question);

    const points =
        question.locationType === "custom"
            ? filterPointsWithinRadius(
                  rawPoints,
                  question.lng,
                  question.lat,
                  question.radius,
                  question.unit,
              )
            : rawPoints;

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

    const circle = await arcBuffer(
        turf.featureCollection([turf.point([question.lng, question.lat])]),
        question.radius,
        question.unit,
    );

    return turf.intersect(
        turf.featureCollection([safeUnion(mapData), correctPolygon, circle]),
    );
};

export const hiderifyTentacles = async (question: TentacleQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const rawPoints =
        question.locationType === "custom"
            ? turf.featureCollection(question.places)
            : await findTentacleLocations(question);

    const points =
        question.locationType === "custom"
            ? filterPointsWithinRadius(
                  rawPoints,
                  question.lng,
                  question.lat,
                  question.radius,
                  question.unit,
              )
            : rawPoints;

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

export const tentaclesPlanningPolygon = async (question: TentacleQuestion) => {
    const rawPoints =
        question.locationType === "custom"
            ? turf.featureCollection(question.places)
            : await findTentacleLocations(question);

    const points =
        question.locationType === "custom"
            ? filterPointsWithinRadius(
                  rawPoints,
                  question.lng,
                  question.lat,
                  question.radius,
                  question.unit,
              )
            : rawPoints;

    const voronoi = geoSpatialVoronoi(points);
    const circle = await arcBuffer(
        turf.featureCollection([turf.point([question.lng, question.lat])]),
        question.radius,
        question.unit,
    );

    const interiorVoronoi = voronoi.features
        .map((feature) =>
            turf.intersect(turf.featureCollection([feature, circle])),
        )
        .filter((feature) => feature !== null);

    return turf.combine(
        turf.featureCollection(
            interiorVoronoi
                .map((x: any) => turf.polygonToLine(x))
                .flatMap((line) =>
                    line.type === "FeatureCollection" ? line.features : [line],
                ),
        ),
    );
};
