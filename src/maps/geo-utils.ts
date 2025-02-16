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

export const lngLatToText = (coordinates: [number, number]) => {
    /**
     * @param coordinates - Should be in longitude, latitude order
     */
    return `${Math.abs(coordinates[1])}°${coordinates[1] > 0 ? "N" : "S"}, ${Math.abs(coordinates[0])}°${coordinates[0] > 0 ? "E" : "W"}`;
};

export const groupObjects = (objects: any[]): any[][] => {
    const filteredObjects = objects.filter(
        (obj) =>
            obj.properties.name !== undefined ||
            obj.properties["name:en"] !== undefined ||
            obj.properties.network !== undefined,
    );

    const n = filteredObjects.length;
    const parent: number[] = Array.from({ length: n }, (_, i) => i);

    const find = (i: number): number => {
        if (parent[i] !== i) {
            parent[i] = find(parent[i]);
        }
        return parent[i];
    };

    const union = (i: number, j: number): void => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) {
            parent[rootJ] = rootI;
        }
    };

    const keys = ["name", "name:en", "network"];
    const paramMap: Record<string, number> = {};

    for (let i = 0; i < n; i++) {
        const obj = filteredObjects[i];
        for (const key of keys) {
            const value = obj.properties[key];
            if (value !== undefined) {
                const mapKey = `${key}:${value}`;
                if (paramMap[mapKey] === undefined) {
                    paramMap[mapKey] = i;
                } else {
                    union(i, paramMap[mapKey]);
                }
            }
        }
    }

    const groups: Record<number, any[]> = {};
    for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!groups[root]) {
            groups[root] = [];
        }
        groups[root].push(filteredObjects[i]);
    }
    return Object.values(groups);
};

export const nearestNeighborSort = (points: [number, number][]) => {
    if (points.length === 0) return [];

    const ordered: [number, number][][] = [[]];
    const remaining = [...points];

    let current = remaining.shift();

    if (!current) return [];

    ordered[0].push(current);

    while (remaining.length > 0) {
        let nearestIndex = 0;
        let minDist = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const dx = current[0] - remaining[i][0];
            const dy = current[1] - remaining[i][1];
            const dist = dx ** 2 + dy ** 2; // First off, no need to square root as everything is relative. Secondly, technically this function is solely for speed from turf.buffer. Therefore, using turf.distance for an accurate distance is not needed as it just slows the program down here.

            if (dist < minDist) {
                minDist = dist;
                nearestIndex = i;
            }
        }

        if (minDist > 0.5) {
            ordered.push([]);
        }

        current = remaining.splice(nearestIndex, 1)[0];
        ordered[ordered.length - 1].push(current);
    }

    return ordered;
};
