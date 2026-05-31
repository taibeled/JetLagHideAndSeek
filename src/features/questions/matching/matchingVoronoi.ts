import { featureCollection, point } from "@turf/helpers";
import union from "@turf/union";
import voronoi from "@turf/voronoi";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type { Bbox } from "@/shared/geojson";
import type { OsmFeature } from "@/features/questions/matching/matchingTypes";

export function makeOsmKey(
    osmType: "node" | "way" | "relation",
    osmId: number,
): string {
    return `${osmType}/${osmId}`;
}

export function computeVoronoiCells(
    candidates: (OsmFeature & { distanceMeters?: number })[],
    bbox: Bbox,
): FeatureCollection<Polygon, { osmKey: string }> {
    if (candidates.length === 0) {
        return featureCollection([]);
    }

    // Deduplicate by (osmType, osmId) and by coordinates to avoid malformed
    // Turf Voronoi output when duplicate points are present.
    const seenKeys = new Set<string>();
    const seenCoords = new Set<string>();
    const deduped: typeof candidates = [];

    for (const candidate of candidates) {
        const key = makeOsmKey(candidate.osmType, candidate.osmId);
        const coordKey = `${candidate.lon.toFixed(6)},${candidate.lat.toFixed(6)}`;
        if (seenKeys.has(key) || seenCoords.has(coordKey)) {
            continue;
        }
        seenKeys.add(key);
        seenCoords.add(coordKey);
        deduped.push(candidate);
    }

    const points = deduped.map((c) =>
        point([c.lon, c.lat], { osmKey: makeOsmKey(c.osmType, c.osmId) }),
    );

    const cells = voronoi(featureCollection(points), { bbox });

    // Ensure each cell preserves the osmKey property
    return {
        ...cells,
        features: cells.features.map((feature, index) => ({
            ...feature,
            properties: {
                ...feature.properties,
                osmKey: makeOsmKey(
                    deduped[index].osmType,
                    deduped[index].osmId,
                ),
            },
        })),
    } as FeatureCollection<Polygon, { osmKey: string }>;
}

export function buildOsmMatchingHitMask(
    cells: FeatureCollection<Polygon>,
    selectedOsmKey: string | null,
): FeatureCollection<Polygon | MultiPolygon> {
    if (selectedOsmKey === null) {
        return featureCollection([]);
    }

    const selectedCell = cells.features.find(
        (f) => f.properties?.osmKey === selectedOsmKey,
    );

    if (!selectedCell) {
        return featureCollection([]);
    }

    return featureCollection([selectedCell]);
}

export function buildOsmMatchingMissMask(
    cells: FeatureCollection<Polygon>,
    selectedOsmKey: string | null,
): FeatureCollection<Polygon | MultiPolygon> {
    const otherCells =
        selectedOsmKey === null
            ? cells.features
            : cells.features.filter(
                  (f) => f.properties?.osmKey !== selectedOsmKey,
              );

    if (otherCells.length === 0) {
        return featureCollection([]);
    }

    if (otherCells.length === 1) {
        return featureCollection([otherCells[0]]) as FeatureCollection<
            Polygon | MultiPolygon
        >;
    }

    const result = union(featureCollection(otherCells));

    if (result === null) {
        return featureCollection([]);
    }

    return featureCollection([result]) as FeatureCollection<
        Polygon | MultiPolygon
    >;
}
