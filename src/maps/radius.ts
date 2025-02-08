import { defaultUnit, hiderMode, questions } from "@/lib/context";
import { iconColors } from "./api";
import * as turf from "@turf/turf";
import type { LatLng } from "leaflet";

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
    masked: boolean,
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
            turf.featureCollection(
                mapData.features.length > 1
                    ? [turf.union(mapData)!, circle]
                    : [...mapData.features, circle],
            ),
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

export const addDefaultRadius = (center: LatLng) => {
    questions.set([
        ...questions.get(),
        {
            id: "radius",
            key: Math.random() * 1e9,
            data: {
                radius: 50,
                unit: defaultUnit.get(),
                lat: center.lat,
                lng: center.lng,
                within: false,
                color: Object.keys(iconColors)[
                    Math.floor(Math.random() * Object.keys(iconColors).length)
                ] as keyof typeof iconColors,
                drag: true,
            },
        },
    ]);
};

export const hiderifyRadius = (question: RadiusQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const distance = turf.distance(
        turf.point([question.lng, question.lat]),
        turf.point([$hiderMode.longitude, $hiderMode.latitude]),
        { units: "miles" },
    );

    if (distance <= question.radius) {
        question.within = true;
    } else {
        question.within = false;
    }

    return question;
};
