import { featureCollection, point } from "@turf/helpers";
import union from "@turf/union";
import voronoi from "@turf/voronoi";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";

import type { Bbox } from "@/shared/geojson";
import type { OsmFeature } from "@/features/questions/matching/matchingTypes";

export function makeOsmKey(
    osmType: "node" | "way" | "relation",
    osmId: number,
): string {
    return `${osmType}/${osmId}`;
}

const MAX_VORONOI_CACHE_SIZE = 20;
const voronoiCache = new Map<
    string,
    FeatureCollection<Polygon, { osmKey: string; nameLength?: number }>
>();

export function clearVoronoiCache() {
    voronoiCache.clear();
}

function voronoiCacheKey(
    candidates: (OsmFeature & { distanceMeters?: number })[],
    bbox: Bbox,
): string {
    const keys = candidates
        .map((c) => {
            const base = `${makeOsmKey(c.osmType, c.osmId)}@${c.lon.toFixed(6)},${c.lat.toFixed(6)}`;
            // Include nameLength in the key so candidates that differ only by
            // this optional property don't collide in the cache.
            const nl = c.nameLength !== undefined ? `:nl${c.nameLength}` : "";
            return `${base}${nl}`;
        })
        .sort()
        .join(",");
    return `${keys}|${bbox.join(",")}`;
}

export function computeVoronoiCells(
    candidates: (OsmFeature & { distanceMeters?: number })[],
    bbox: Bbox,
): FeatureCollection<Polygon, { osmKey: string; nameLength?: number }> {
    if (candidates.length === 0) {
        return featureCollection([]);
    }

    const cacheKey = voronoiCacheKey(candidates, bbox);
    const cached = voronoiCache.get(cacheKey);
    if (cached) {
        voronoiCache.delete(cacheKey);
        voronoiCache.set(cacheKey, cached);
        return cached;
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

    // Ensure each cell preserves the osmKey property and nameLength (if present)
    const result = {
        ...cells,
        features: cells.features.map((feature, index) => {
            const candidate = deduped[index];
            const props: Record<string, unknown> = {
                ...feature.properties,
                osmKey: makeOsmKey(candidate.osmType, candidate.osmId),
            };
            if (candidate.nameLength !== undefined) {
                props.nameLength = candidate.nameLength;
            }
            return {
                ...feature,
                properties: props,
            };
        }),
    } as FeatureCollection<Polygon, { osmKey: string; nameLength?: number }>;

    // Evict oldest entry when cache exceeds max size.
    if (voronoiCache.size >= MAX_VORONOI_CACHE_SIZE) {
        const oldest = voronoiCache.keys().next().value;
        if (oldest !== undefined) voronoiCache.delete(oldest);
    }
    voronoiCache.set(cacheKey, result);

    return result;
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

/**
 * Build hit and miss masks for station-name-length questions.
 *
 * Hit  = union of Voronoi cells whose station name length matches the
 *        selected station's name length.
 * Miss = union of all other Voronoi cells.
 */
export function buildNameLengthMasks(
    cells: FeatureCollection<Polygon, { nameLength?: number; osmKey: string }>,
    selectedNameLength: number | null,
): {
    hitMask: FeatureCollection<Polygon | MultiPolygon>;
    missMask: FeatureCollection<Polygon | MultiPolygon>;
} {
    if (selectedNameLength === null) {
        return {
            hitMask: featureCollection([]),
            missMask: featureCollection([]),
        };
    }

    const matchCells = cells.features.filter(
        (f) => f.properties?.nameLength === selectedNameLength,
    );
    const otherCells = cells.features.filter(
        (f) => f.properties?.nameLength !== selectedNameLength,
    );

    const hitMask = unionMany(matchCells);
    const missMask = unionMany(otherCells);

    return { hitMask, missMask };
}

function unionMany(
    features: Feature<Polygon>[],
): FeatureCollection<Polygon | MultiPolygon> {
    if (features.length === 0) {
        return featureCollection([]);
    }
    if (features.length === 1) {
        return featureCollection([features[0]]) as FeatureCollection<
            Polygon | MultiPolygon
        >;
    }
    const result = union(featureCollection(features));
    if (result === null) {
        return featureCollection([]);
    }
    return featureCollection([result]) as FeatureCollection<
        Polygon | MultiPolygon
    >;
}
