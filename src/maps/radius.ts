import type { iconColors } from "./api";
import * as turf from "@turf/turf";

export interface RadiusQuestion {
    radius: number;
    unit?: turf.Units;
    lat: number;
    lng: number;
    within: boolean;
    color?: keyof typeof iconColors;
    drag?: boolean;
}

export const adjustPerRadius = (
    question: RadiusQuestion,
    mapData: any,
    masked: boolean
) => {
    if (mapData === null) return;

    const point = turf.point([question.lng, question.lat]);
    const circle = turf.circle(point, question.radius, {
        units: question.unit ?? "miles",
    });

    if (question.within) {
        if (masked) {
            throw new Error("Cannot be masked");
        }

        return turf.intersect(
            turf.featureCollection(mapData.features.length > 1 ? [turf.union(mapData)!, circle] : [...mapData.features, circle])
        );
    } else {
        if (!masked) {
            throw new Error("Must be masked");
        }
        return turf.union(
            turf.featureCollection([...mapData.features, circle])
        );
    }
};
