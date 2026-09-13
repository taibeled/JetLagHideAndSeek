import type {
    BBox,
    Feature,
    FeatureCollection,
    Geometry,
    GeometryCollection,
    MultiPolygon,
    Polygon,
} from "geojson";
import { toast } from "react-toastify";

import { cacheFetch } from "./cache";
import { JETLAG_GEODATA_API } from "./constants";
import { poiQueryBounds } from "./poiBounds";
import { CacheType } from "./types";

const request = async (
    path: string,
    params: Record<string, string | number>,
) => {
    const query = new URLSearchParams(
        Object.entries({ ...params, v: "2" }).map(([key, value]) => [
            key,
            String(value),
        ]),
    );
    const response = await cacheFetch(
        `${JETLAG_GEODATA_API.replace(/\/$/, "")}/v1/${path}?${query}`,
        "Loading map data...",
        CacheType.CACHE,
        AbortSignal.timeout(20000),
    );
    const body = await response.json();
    if (!response.ok)
        throw Object.assign(
            new Error(body?.error?.message || `HTTP ${response.status}`),
            { code: body?.error?.code },
        );
    return body;
};

const queryAt = (bbox: BBox, lat: number, lng: number) => ({
    bbox: (bbox.length === 6
        ? [bbox[0], bbox[1], bbox[3], bbox[4]]
        : bbox
    ).join(","),
    lat,
    lng,
});

export const fetchGeodataFeatures = async (
    type: string,
    bbox: BBox,
    lat: number,
    lng: number,
    area?: FeatureCollection<Polygon | MultiPolygon>,
): Promise<FeatureCollection<Exclude<Geometry, GeometryCollection>>> => {
    const paths: Record<string, string> = {
        "body-of-water": "water/features",
        motorway: "motorways",
        "highspeed-measure-shinkansen": "highspeed-rail",
        peak: "peaks",
    };
    if (area && !paths[type]) {
        const features = new Map<
            string,
            Feature<Exclude<Geometry, GeometryCollection>>
        >();
        const pending = poiQueryBounds(area).map((box) => ({ box, depth: 0 }));
        let requests = 0;
        while (pending.length) {
            const { box, depth } = pending.shift()!;
            if (++requests > 64)
                throw Object.assign(
                    new Error(
                        "This area needs too many place queries. Narrow the play area and try again.",
                    ),
                    { code: "INCOMPLETE_COVERAGE" },
                );
            let result;
            try {
                result = await fetchGeodataFeatures(type, box, lat, lng);
            } catch (error) {
                if (
                    (error as { code?: string }).code !==
                        "INCOMPLETE_COVERAGE" ||
                    depth >= 6
                )
                    throw error;
                const axis = box[2] - box[0] >= box[3] - box[1] ? 0 : 1;
                const middle = (box[axis] + box[axis + 2]) / 2;
                const left = [...box] as BBox;
                const right = [...box] as BBox;
                left[axis + 2] = middle;
                right[axis] = middle;
                pending.unshift(
                    { box: left, depth: depth + 1 },
                    { box: right, depth: depth + 1 },
                );
                continue;
            }
            for (const feature of result.features) {
                const key = String(
                    feature.properties?.id ?? JSON.stringify(feature.geometry),
                );
                features.set(key, feature);
            }
        }
        return { type: "FeatureCollection", features: [...features.values()] };
    }
    const result = await request(paths[type] || "places", {
        ...queryAt(bbox, lat, lng),
        type,
        complete: 1,
        ...(!paths[type] ? { limit: 20000 } : {}),
    });
    // Older servers can return a sample with a successful status.
    if (
        result.type !== "FeatureCollection" ||
        result.complete !== true ||
        !Array.isArray(result.features)
    ) {
        throw Object.assign(
            new Error("Map data is incomplete for this area."),
            { code: "INCOMPLETE_COVERAGE" },
        );
    }
    return result;
};

export const tryFetchGeodataFeatures = async (
    ...args: Parameters<typeof fetchGeodataFeatures>
) => {
    try {
        return await fetchGeodataFeatures(...args);
    } catch (error) {
        if ((error as { code?: string }).code === "INCOMPLETE_COVERAGE")
            throw error;
        toast.info("The API is unavailable. Trying Overpass...");
        return null;
    }
};

export interface ElevationRegions {
    higher: Feature<Polygon | MultiPolygon> | null;
    lower: Feature<Polygon | MultiPolygon> | null;
}

export const fetchMotorways = (bbox: BBox) =>
    request("motorways", { bbox: bbox.join(","), adaptive: 1, complete: 1 });

export const fetchElevationRegions = async (
    bbox: BBox,
    lat: number,
    lng: number,
): Promise<ElevationRegions> => {
    const result = await request("elevation/regions", queryAt(bbox, lat, lng));
    if (!("higher" in result) || !("lower" in result)) {
        throw new Error("Elevation data is unavailable for this area.");
    }
    return result;
};

export const fetchStreetRegion = async (
    lat: number,
    lng: number,
    bbox: BBox,
): Promise<{
    streetName: string;
    highway: string | null;
    region: Feature<Polygon | MultiPolygon>;
}> => request("street-or-path/region", queryAt(bbox, lat, lng));

export const fetchLandmass = async (
    lat: number,
    lng: number,
): Promise<Feature<Polygon | MultiPolygon>> => {
    const result = await request("landmass", { lat, lng, snapMeters: 0 });
    return result.landmass;
};
