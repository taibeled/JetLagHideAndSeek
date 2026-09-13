import { bbox, flatten } from "@turf/turf";
import type { BBox, FeatureCollection, MultiPolygon, Polygon } from "geojson";

export const poiQueryBounds = (
    area: FeatureCollection<Polygon | MultiPolygon>,
): BBox[] => {
    const groups = new Map<string, number[]>();
    for (const feature of flatten(area).features) {
        const box = bbox(feature);
        const midLng = (box[0] + box[2]) / 2;
        const midLat = (box[1] + box[3]) / 2;
        const key = `${Math.floor(midLng / 20)},${Math.floor(midLat / 20)}`;
        const group = groups.get(key);
        if (group) {
            group[0] = Math.min(group[0], box[0]);
            group[1] = Math.min(group[1], box[1]);
            group[2] = Math.max(group[2], box[2]);
            group[3] = Math.max(group[3], box[3]);
        } else groups.set(key, [...box]);
    }
    const boxes = [...groups.values()];
    // Keep distant islands separate; discard boxes already covered by another.
    return boxes.filter(
        (box, index) =>
            !boxes.some(
                (other, otherIndex) =>
                    otherIndex !== index &&
                    other[0] <= box[0] &&
                    other[1] <= box[1] &&
                    other[2] >= box[2] &&
                    other[3] >= box[3] &&
                    (otherIndex < index ||
                        other.some((value, i) => value !== box[i])),
            ),
    ) as BBox[];
};
