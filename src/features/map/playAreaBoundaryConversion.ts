import osmtogeojson from "osmtogeojson";

import type { GeoJsonFeatureCollection } from "./geojsonTypes";
import { calculateBbox, calculateCenter, type PlayArea } from "./playArea";

export function buildPlayAreaFromOverpass(
    relationId: number,
    overpassJson: unknown,
): PlayArea {
    const converted = osmtogeojson(overpassJson);
    const boundary = filterBoundaryFeatures(
        converted as unknown as GeoJsonFeatureCollection,
    );

    return buildPlayAreaFromBoundary(relationId, boundary);
}

export function buildPlayAreaFromBoundary(
    relationId: number,
    boundary: GeoJsonFeatureCollection,
): PlayArea {
    if (boundary.features.length === 0) {
        throw new Error(`No polygon boundary found for relation ${relationId}`);
    }

    const bbox = calculateBbox(boundary);
    return {
        bbox,
        boundary,
        center: calculateCenter(bbox),
        label: getBoundaryLabel(boundary, relationId),
        osmId: relationId,
        osmType: "R",
    };
}

function filterBoundaryFeatures(
    boundary: GeoJsonFeatureCollection,
): GeoJsonFeatureCollection {
    return {
        features: boundary.features.filter(
            (feature) =>
                feature.geometry.type === "Polygon" ||
                feature.geometry.type === "MultiPolygon",
        ),
        type: "FeatureCollection",
    };
}

function getBoundaryLabel(
    boundary: GeoJsonFeatureCollection,
    relationId: number,
): string {
    for (const feature of boundary.features) {
        const name = feature.properties?.name;
        if (typeof name === "string" && name.trim()) return name;
    }

    return `OSM relation ${relationId}`;
}
