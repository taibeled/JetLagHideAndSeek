import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { expect } from "vitest";

/**
 * Leaflet rejects rings where consecutive coordinates repeat (closing vertex semantics aside).
 */
export function assertRingHasNoConsecutiveDuplicates(ring: Position[]): void {
    for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1];
        const b = ring[i];
        expect(
            a[0] === b[0] && a[1] === b[1],
            `consecutive duplicate at ring index ${i}`,
        ).toBe(false);
    }
}

export function assertPolygonalFeatureHasCleanRings(
    feature: Feature<Polygon | MultiPolygon>,
): void {
    const g = feature.geometry;
    if (g.type === "Polygon") {
        for (const ring of g.coordinates) {
            assertRingHasNoConsecutiveDuplicates(ring);
        }
        return;
    }
    for (const polygon of g.coordinates) {
        for (const ring of polygon) {
            assertRingHasNoConsecutiveDuplicates(ring);
        }
    }
}
