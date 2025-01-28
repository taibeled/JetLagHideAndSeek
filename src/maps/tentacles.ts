import { findTentacleLocations, type iconColors } from "./api";
import * as turf from "@turf/turf";

type TentacleLocations = "aquarium" | "zoo" | "theme_park" | "museum" | "hospital";

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
    masked: boolean
) => {
    if (mapData === null) return;
    if (masked) {
        throw new Error("Cannot be masked");
    }

    const points = await findTentacleLocations(question);
    const voronoi = turf.voronoi(points);

    const correctPolygon = voronoi.features.find((feature: any) => {
        if (!question.location) return false;
        return feature.properties.name === question.location.properties.name;
    });
    if (!correctPolygon) {
        return mapData;
    }

    const circle = turf.circle(
        turf.point([question.lng, question.lat]),
        question.radius,
        {
            units: question.unit ?? "miles",
        }
    );

    return turf.intersect(
        turf.featureCollection([...mapData.features, correctPolygon, circle])
    );
};
