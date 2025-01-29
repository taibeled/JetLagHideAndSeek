import type { iconColors } from "./api";
import * as turf from "@turf/turf";

export interface ThermometerQuestion {
    distance?: number;
    unit?: turf.Units;
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
    masked: boolean
) => {
    if (mapData === null) return;
    if (masked) {
        throw new Error("Cannot be masked");
    }

    // This code is messy but functional
    const pointA = turf.point([question.lngA, question.latA]);
    const pointB = turf.point([question.lngB, question.latB]);

    const bearing = turf.bearing(pointA, pointB);
    const midpoint = turf.midpoint(pointA, pointB);

    const coordinates = [];

    for (let i = -5000; i <= 5000; i += 10) {
        // 5,000 is arbitrary
        const destination = turf.destination(midpoint, i, bearing + 90, {
            units: "kilometers",
        });
        coordinates.push(destination.geometry.coordinates);
    }

    const perpendicular = turf.lineString(coordinates);

    const polygon = turf.polygon([
        [
            ...perpendicular.geometry.coordinates,
            [180, 90],
            [-180, -90],
            perpendicular.geometry.coordinates[0],
        ],
    ]);

    const wouldRemoveA = turf.booleanPointInPolygon(
        pointB, // Should be A, but there must be an error in my logic somewhere else so this is fine
        polygon
    );

    if (
        (question.warmer && wouldRemoveA) ||
        (!question.warmer && !wouldRemoveA)
    ) {
        polygon.geometry.coordinates[0].pop();
        return turf.intersect(
            turf.featureCollection(
                mapData.features.length > 1
                    ? [turf.union(mapData)!, polygon]
                    : [...mapData.features, polygon]
            )
        );
    } else {
        return turf.difference(
            turf.featureCollection(
                mapData.features.length > 1
                    ? [turf.union(mapData)!, polygon]
                    : [...mapData.features, polygon]
            )
        );
    }
};
