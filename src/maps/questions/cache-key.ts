import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";

import { playableTerritoryUnion } from "@/lib/context";

/**
 * Short digest of the remaining playable territory, so memoized boundary
 * lookups re-run when the territory shrinks but not on every store write.
 */
export const playableTerritoryDigest = (): string | undefined => {
    const ptu = playableTerritoryUnion.get();

    return ptu?.geometry != null
        ? turf
              .bbox(ptu as Feature<Polygon | MultiPolygon>)
              .map((x: number) => x.toFixed(4))
              .join(",")
        : undefined;
};

/**
 * OSM-ref exclusions in a canonical form, so a cache key only changes when the
 * set of excluded places changes — not when the host reorders them.
 */
export const normalizedOsmRefs = (refs: readonly string[] | undefined) =>
    [...(refs ?? [])]
        .map((ref) => ref.trim().toLowerCase())
        .filter(Boolean)
        .sort();
