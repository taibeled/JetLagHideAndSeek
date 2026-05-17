import tokyoBoundaryJson from "../../../assets/default-zones/tokyo.json";

import type { Bbox, GeoJsonFeatureCollection, Position } from "./geojsonTypes";

export type DefaultPlayArea = {
    bbox: Bbox;
    boundary: GeoJsonFeatureCollection;
    center: Position;
    label: string;
    osmId: number;
    osmType: "R";
};

export type PlayArea = DefaultPlayArea;

export type PlayAreaCacheSource =
    | "bundled"
    | "fetched"
    | "memory"
    | "persisted";

const tokyoBoundary = tokyoBoundaryJson as unknown as GeoJsonFeatureCollection;

export function calculateBbox(boundary: GeoJsonFeatureCollection): Bbox {
    const coords: Position[] = [];

    for (const feature of boundary.features) {
        if (feature.bbox) {
            const [west, south, east, north] = feature.bbox;
            coords.push([west, south], [east, north]);
            continue;
        }

        collectPositions(feature.geometry.coordinates, coords);
    }

    if (coords.length === 0) {
        throw new Error(
            "Cannot calculate bbox for an empty play-area boundary.",
        );
    }

    return coords.reduce<Bbox>(
        ([west, south, east, north], [lng, lat]) => [
            Math.min(west, lng),
            Math.min(south, lat),
            Math.max(east, lng),
            Math.max(north, lat),
        ],
        [Infinity, Infinity, -Infinity, -Infinity],
    );
}

export function calculateCenter([west, south, east, north]: Bbox): Position {
    return [(west + east) / 2, (south + north) / 2];
}

export const defaultPlayArea: DefaultPlayArea = {
    bbox: calculateBbox(tokyoBoundary),
    boundary: tokyoBoundary,
    center: calculateCenter(calculateBbox(tokyoBoundary)),
    label: "Tokyo 23 Wards",
    osmId: 19631009,
    osmType: "R",
};

export const knownPlayAreaPresets: PlayArea[] = [defaultPlayArea];

function collectPositions(value: unknown, output: Position[]) {
    if (!Array.isArray(value)) return;

    if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
    ) {
        output.push([value[0], value[1]]);
        return;
    }

    for (const child of value) {
        collectPositions(child, output);
    }
}
