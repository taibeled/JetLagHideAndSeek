import type { LatLng } from "leaflet";
import { findTentacleLocations, iconColors } from "./api";
import * as turf from "@turf/turf";
import { defaultUnit, questions } from "@/utils/context";
import { geoSpatialVoronoi } from "./voronoi";

export type TentacleLocations =
    | "aquarium"
    | "zoo"
    | "theme_park"
    | "museum"
    | "hospital"
    | "cinema"
    | "library";

export interface TentacleQuestion {
    radius: number;
    unit?: turf.Units;
    lat: number;
    lng: number;
    color?: keyof typeof iconColors;
    drag?: boolean;
    location:
        | ReturnType<
              typeof turf.point<{
                  name: any;
              }>
          >
        | false;
    locationType: TentacleLocations;
}

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
            units: question.unit ?? "miles",
        },
    );

    return turf.intersect(
        turf.featureCollection(
            mapData.features.length > 1
                ? [turf.union(mapData)!, correctPolygon, circle]
                : [...mapData.features, correctPolygon, circle],
        ),
    );
};

export const addDefaultTentacles = (center: LatLng) => {
    questions.set([
        ...questions.get(),
        {
            id: "tentacles",
            key: Math.random() * 1e9,
            data: {
                color: Object.keys(iconColors)[
                    Math.floor(Math.random() * Object.keys(iconColors).length)
                ] as keyof typeof iconColors,
                lat: center.lat,
                unit: defaultUnit.get(),
                lng: center.lng,
                drag: true,
                location: false,
                locationType: "theme_park",
                radius: 15,
            },
        },
    ]);
};
