import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Point } from "geojson";

import type { APILocations } from "@/maps/schema";

/** Empirical breakpoint from Tokyo diplomatic cluster sweep: 12.25m causes large chain merges. */
export const CONSULATE_NEARBY_MERGE_THRESHOLD_M = 12;

type PointProps = Record<string, unknown> | null | undefined;

function haversineMeters(
    a: Feature<Point, PointProps>,
    b: Feature<Point, PointProps>,
): number {
    return turf.distance(a, b, { units: "meters" });
}

function find(parent: number[], x: number): number {
    if (parent[x] !== x) {
        parent[x] = find(parent, parent[x]);
    }
    return parent[x];
}

function union(parent: number[], rank: number[], a: number, b: number): void {
    const rootA = find(parent, a);
    const rootB = find(parent, b);
    if (rootA === rootB) return;
    if (rank[rootA] < rank[rootB]) {
        parent[rootA] = rootB;
        return;
    }
    if (rank[rootA] > rank[rootB]) {
        parent[rootB] = rootA;
        return;
    }
    parent[rootB] = rootA;
    rank[rootA] += 1;
}

function representativePointIndex(
    indexes: number[],
    points: FeatureCollection<Point, PointProps>,
): number {
    if (indexes.length === 1) return indexes[0];
    let bestIdx = indexes[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const i of indexes) {
        let score = 0;
        for (const j of indexes) {
            if (i === j) continue;
            score += haversineMeters(points.features[i], points.features[j]);
        }
        if (score < bestScore) {
            bestScore = score;
            bestIdx = i;
        }
    }
    return bestIdx;
}

function sortClusterNames(names: string[]): string[] {
    return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Merge nearby POIs into stable cluster representatives.
 * The output keeps one Point per connected component and stores member metadata on properties.
 */
export function mergeNearbyPoiPoints(
    points: FeatureCollection<Point, PointProps>,
    thresholdMeters: number,
): FeatureCollection<Point, PointProps> {
    if (points.features.length < 2 || thresholdMeters <= 0) {
        return points;
    }

    const n = points.features.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const rank = new Array(n).fill(0);

    for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
            if (
                haversineMeters(points.features[i], points.features[j]) <=
                thresholdMeters
            ) {
                union(parent, rank, i, j);
            }
        }
    }

    const components = new Map<number, number[]>();
    for (let i = 0; i < n; i += 1) {
        const root = find(parent, i);
        const group = components.get(root);
        if (group) {
            group.push(i);
        } else {
            components.set(root, [i]);
        }
    }

    const grouped = [...components.values()].sort((a, b) => a[0] - b[0]);
    const mergedFeatures = grouped.map((indexes, clusterOrdinal) => {
        const repIndex = representativePointIndex(indexes, points);
        const rep = points.features[repIndex];
        const names = sortClusterNames(
            indexes
                .map((i) => points.features[i].properties?.name)
                .filter((x): x is string => typeof x === "string"),
        );
        const clusterId = `cluster-${clusterOrdinal}`;
        const representativeName =
            typeof rep.properties?.name === "string"
                ? rep.properties.name
                : names[0] ?? "POI cluster";

        return turf.point(rep.geometry.coordinates, {
            ...(rep.properties ?? {}),
            name: representativeName,
            clusterId,
            memberCount: indexes.length,
            memberNames: names,
            memberIndexes: indexes,
        });
    });

    return turf.featureCollection(mergedFeatures);
}

export function mergeNearbyPoiPointsForLocation(
    points: FeatureCollection<Point, PointProps>,
    locationType: APILocations,
): FeatureCollection<Point, PointProps> {
    if (locationType !== "consulate") return points;
    return mergeNearbyPoiPoints(points, CONSULATE_NEARBY_MERGE_THRESHOLD_M);
}
