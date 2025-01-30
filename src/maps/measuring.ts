import { fetchCoastline, type iconColors } from "./api";
import * as turf from "@turf/turf";
import type { BBox, Feature, MultiPolygon } from "geojson";

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
    masked: boolean,
    bBox?: BBox
) => {
    if (mapData === null) return;

    switch (question.type) {
        case "coastline":
            const coastline = turf.lineToPolygon(
                await fetchCoastline()
            ) as Feature<MultiPolygon>;

            const distanceToCoastline = turf.pointToPolygonDistance(
                turf.point([question.lng, question.lat]),
                coastline,
                {
                    units: "miles",
                    method: "geodesic",
                }
            );

            const buffed = turf.buffer(
                turf.bboxClip(coastline, bBox ? bBox : [-180, -90, 180, 90]),
                distanceToCoastline,
                {
                    units: "miles",
                    steps: 64,
                }
            );

            if (question.hiderCloser) {
                if (!masked) throw new Error("Must be masked");
                return turf.union(
                    turf.featureCollection([...mapData.features, buffed])
                );
            } else {
                if (masked) throw new Error("Cannot be masked");
                return turf.intersect(
                    turf.featureCollection(
                        mapData.features.length > 1
                            ? [turf.union(mapData)!, buffed]
                            : [...mapData.features, buffed]
                    )
                );
            }
    }
};
