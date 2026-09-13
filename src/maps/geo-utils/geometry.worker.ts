import { booleanPointInPolygon, point, pointsWithinPolygon } from "@turf/turf";

import { arcBufferToPoint, holedMask, modifyMapData } from "./operators";
import { geoSpatialVoronoi } from "./voronoi";

self.onmessage = async ({ data }) => {
    try {
        let region;
        switch (data.operation) {
            case "matching": {
                const seeker = point([data.lng, data.lat]);
                region = geoSpatialVoronoi(data.geometry).features.find(
                    (cell) => booleanPointInPolygon(seeker, cell),
                );
                if (!region)
                    throw new Error("Could not find the nearest-place region.");
                break;
            }
            case "filter":
                region = pointsWithinPolygon(data.geometry, data.area);
                break;
            case "mask":
                region = holedMask(data.geometry);
                break;
            case "clip":
                region = modifyMapData(data.geometry, data.region, data.within);
                break;
            case "buffer":
                region = await arcBufferToPoint(
                    data.geometry,
                    data.lat,
                    data.lng,
                );
                break;
            default:
                throw new Error("Unknown geometry operation.");
        }
        self.postMessage({ region });
    } catch (error) {
        self.postMessage({
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
