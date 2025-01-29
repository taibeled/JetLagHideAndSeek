import { fetchCoastline, type iconColors } from "./api";
import * as turf from "@turf/turf";

export interface BaseMeasuringQuestion {
    lat: number;
    lng: number;
    hiderCloser: boolean;
    color?: keyof typeof iconColors;
    drag?: boolean;
}

export interface CoastlineMeasuringQuestion extends BaseMeasuringQuestion {
    type: "coastline";
}

export type MeasuringQuestion = CoastlineMeasuringQuestion;

export const adjustPerMeasuring = async (
    question: MeasuringQuestion,
    mapData: any,
    masked: boolean
) => {
    if (mapData === null) return;

    switch (question.type) {
        case "coastline":
            const coastline = turf.lineToPolygon(await fetchCoastline());

            const distanceToCoastline = turf.pointToPolygonDistance(
                turf.point([question.lng, question.lat]),
                coastline,
                {
                    units: "miles",
                    method: "geodesic",
                }
            );

            const buffed = turf.buffer(coastline, distanceToCoastline, {
                units: "miles",
            }); // This is SLOW as it accounts for the entire coastline of the entire world. TODO: Only buffer reasonably close coastline

            if (question.hiderCloser) {
                if (!masked) throw new Error("Must be masked");
                return turf.union(
                    turf.featureCollection([...mapData.features, buffed]),
                );
            } else {
                if (masked) throw new Error("Cannot be masked");
                return turf.intersect(
                    turf.featureCollection(
                        mapData.features.length > 1
                            ? [turf.union(mapData)!, buffed]
                            : [...mapData.features, buffed],
                    ),
                );
            }
    }
};
