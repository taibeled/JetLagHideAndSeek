import { pointsWithinPolygon } from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";

import { showMapProgress } from "@/lib/mapProgress";

const runGeometry = <T>(data: Record<string, unknown>): Promise<T> =>
    showMapProgress(
        new Promise<T>((resolve, reject) => {
            const worker = new Worker(
                new URL("./geometry.worker.ts", import.meta.url),
                { type: "module" },
            );
            const timeout = setTimeout(() => {
                worker.terminate();
                reject(
                    new Error(
                        "This area took too long to calculate. Try a smaller area.",
                    ),
                );
            }, 60000);
            const finish = () => {
                clearTimeout(timeout);
                worker.terminate();
            };
            worker.onmessage = ({ data }) => {
                finish();
                if ("error" in data) reject(new Error(data.error));
                else resolve(data.region);
            };
            worker.onerror = (event) => {
                finish();
                reject(
                    new Error(event.message || "Could not calculate the map."),
                );
            };
            try {
                worker.postMessage(data);
            } catch (error) {
                finish();
                reject(error);
            }
        }),
        "Calculating the map...",
    );

export const bufferPois = (
    geometry: FeatureCollection,
    lat: number,
    lng: number,
) =>
    runGeometry<Feature<MultiPolygon>>({
        operation: "buffer",
        geometry,
        lat,
        lng,
    });

export const clipMap = (
    geometry: FeatureCollection,
    region: Feature<Polygon | MultiPolygon>,
    within: boolean,
) =>
    runGeometry<Feature<Polygon | MultiPolygon> | null>({
        operation: "clip",
        geometry,
        region,
        within,
    });

export const maskMap = (geometry: FeatureCollection | Feature) =>
    runGeometry<Feature<Polygon | MultiPolygon>>({
        operation: "mask",
        geometry,
    });

export const filterPois = async (
    geometry: FeatureCollection<Point>,
    area: FeatureCollection<Polygon | MultiPolygon>,
) =>
    typeof Worker !== "undefined" && geometry.features.length > 1000
        ? runGeometry<FeatureCollection<Point>>({
              operation: "filter",
              geometry,
              area,
          })
        : pointsWithinPolygon(geometry, area);

export const matchingRegion = (
    geometry: FeatureCollection<Point>,
    lat: number,
    lng: number,
) =>
    runGeometry<Feature<Polygon | MultiPolygon>>({
        operation: "matching",
        geometry,
        lat,
        lng,
    });
