import * as turf from "@turf/turf";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";

export const unionize = (input: FeatureCollection<Polygon | MultiPolygon>) => {
    if (input.features.length > 1) {
        return turf.union(input);
    } else if (input.features.length === 1) {
        return input.features[0];
    } else {
        throw new Error("No features");
    }
};

export const holedMask = (input: any) => {
    input = input.features ? unionize(input) : input;

    const holes = [];

    if (input.geometry.type === "MultiPolygon") {
        for (const feature of input.geometry.coordinates) {
            if (feature.length > 1) {
                holes.push(...feature.slice(1));
            }
        }
    }

    return turf.union(
        turf.featureCollection([
            turf.mask(input),
            // @ts-expect-error This made sense when I wrote it
            turf.multiPolygon(holes.map((x) => [x])),
        ]),
    );
};
