import { hiderMode } from "@/lib/context";
import * as turf from "@turf/turf";
import { unionize } from "./geo-utils";
import type { RadiusQuestion } from "@/lib/schema";

export const adjustPerRadius = (
    question: RadiusQuestion,
    mapData: any,
    masked: boolean,
) => {
    if (mapData === null) return;

    const point = turf.point([question.lng, question.lat]);
    const circle = turf.circle(point, question.radius, {
        units: question.unit,
    });

    if (question.within) {
        if (masked) {
            throw new Error("Cannot be masked");
        }

        return turf.intersect(
            turf.featureCollection([unionize(mapData), circle]),
        );
    } else {
        if (!masked) {
            throw new Error("Must be masked");
        }
        return turf.union(
            turf.featureCollection([...mapData.features, circle]),
        );
    }
};

export const hiderifyRadius = (question: RadiusQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const distance = turf.distance(
        turf.point([question.lng, question.lat]),
        turf.point([$hiderMode.longitude, $hiderMode.latitude]),
        { units: question.unit },
    );

    if (distance <= question.radius) {
        question.within = true;
    } else {
        question.within = false;
    }

    return question;
};

export const radiusPlanningPolygon = (question: RadiusQuestion) => {
    const circle = turf.circle(
        turf.point([question.lng, question.lat]),
        question.radius,
        {
            units: question.unit,
        },
    );

    return turf.polygonToLine(circle);
};
