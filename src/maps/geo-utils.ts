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
