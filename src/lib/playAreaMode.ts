import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";

import { determineGeoJSON } from "@/maps/api";
import { safeUnion } from "@/maps/geo-utils";

import type { PlayAreaModeId } from "./playAreaModes";

let japanBoundary: Feature<Polygon | MultiPolygon> | null = null;

async function getJapanBoundary(): Promise<Feature<Polygon | MultiPolygon> | null> {
    if (japanBoundary) return japanBoundary;
    try {
        // Japan (Relation 382313)
        const geojson = await determineGeoJSON("382313", "R");
        if (geojson && geojson.features.length > 0) {
            japanBoundary = safeUnion(geojson as FeatureCollection<Polygon | MultiPolygon>);
            return japanBoundary;
        }
    } catch (e) {
        console.error("Failed to fetch Japan boundary", e);
    }
    return null;
}

const isPolygonalFeature = (
    feature: Feature,
): feature is Feature<Polygon | MultiPolygon> =>
    feature.geometry?.type === "Polygon" ||
    feature.geometry?.type === "MultiPolygon";

export const normalizePlayAreaGeometry = (
    playArea: unknown,
): FeatureCollection<Polygon | MultiPolygon> | null => {
    if (!playArea) return null;

    if (typeof playArea === "object" && "features" in playArea) {
        const features = ((playArea as { features?: Feature[] }).features ?? []).filter(
            isPolygonalFeature,
        );
        return features.length > 0 ? turf.featureCollection(features) : null;
    }

    if (typeof playArea === "object" && "geometry" in playArea) {
        const feature = playArea as Feature;
        if (isPolygonalFeature(feature)) {
            return turf.featureCollection([feature]);
        }
    }

    return null;
};

/**
 * Robust check if a play area is entirely within Japan.
 */
export async function isPlayAreaWithinJapan(
    playArea: unknown,
): Promise<boolean> {
    const normalized = normalizePlayAreaGeometry(playArea);
    if (!normalized || normalized.features.length === 0) return false;

    const japan = await getJapanBoundary();
    if (!japan) return false;

    try {
        const unifiedPlayArea = safeUnion(normalized);
        // booleanWithin can be finicky with complex MultiPolygons,
        // but it's the most appropriate for "entirely inside".
        return turf.booleanWithin(unifiedPlayArea, japan);
    } catch (e) {
        console.error("Error during Japan containment check", e);
        return false;
    }
}

export async function detectPlayAreaMode(
    playArea: unknown,
): Promise<PlayAreaModeId> {
    if (await isPlayAreaWithinJapan(playArea)) {
        return "japan";
    }
    return "default";
}
