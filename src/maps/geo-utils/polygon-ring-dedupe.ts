import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

/** Strip consecutive duplicate positions from one linear ring (preserves closed rings). */
export function dedupeConsecutiveRingPositions(ring: Position[]): Position[] {
    if (ring.length < 2) return ring;
    const closed =
        ring[0] !== undefined &&
        ring[ring.length - 1] !== undefined &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1];
    const core = closed ? ring.slice(0, -1) : ring.slice();
    const out: Position[] = [];
    for (const p of core) {
        const prev = out[out.length - 1];
        if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
    }

    /**
     * Some turf polygon validators reject any duplicated vertex in a ring (not only adjacent repeats).
     * Keep first occurrence of each coordinate pair after truncation.
     */
    const seen = new Set<string>();
    const unique: Position[] = [];
    for (const p of out) {
        const key = `${p[0]},${p[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(p);
    }

    if (closed && unique.length >= 3 && unique[0]) {
        unique.push([unique[0][0], unique[0][1]]);
    }
    return unique.length >= (closed ? 4 : 3) ? unique : ring;
}

/** Deterministic consecutive-vertex dedupe across polygon / multipolygon rings (Leaflet-safe baseline). */
export function dedupePolygonFeatureVertices(
    feature: Feature<Polygon | MultiPolygon>,
): Feature<Polygon | MultiPolygon> {
    /** Voronoi / turf intersections can produce nearly-coincident vertices that Leaflet treats as illegal repeats. */
    const t = turf.truncate(feature, {
        precision: 11,
        mutate: false,
    }) as Feature<Polygon | MultiPolygon>;
    const g = t.geometry;
    if (g.type === "Polygon") {
        const coords = g.coordinates.map((ring) =>
            dedupeConsecutiveRingPositions(ring),
        );
        return turf.feature(
            { type: "Polygon", coordinates: coords },
            t.properties ?? {},
        ) as Feature<Polygon | MultiPolygon>;
    }
    const coords = g.coordinates.map((poly) =>
        poly.map((ring) => dedupeConsecutiveRingPositions(ring)),
    );
    return turf.feature(
        { type: "MultiPolygon", coordinates: coords },
        t.properties ?? {},
    ) as Feature<Polygon | MultiPolygon>;
}
