import {
    asSeparateMaskConstraints,
    buildCombinedEligibilityMask,
    buildCombinedInsideMask,
    buildPlayAreaMask,
    buildPlayAreaMaskFromMetadata,
    signedRingArea,
} from "../maskBuilder";
import type { GeoJsonFeatureCollection, Position } from "../geojsonTypes";
import { defaultPlayArea } from "../playArea";

function makeSquareFC(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
): GeoJsonFeatureCollection {
    return {
        features: [makeSquareFeature(minX, minY, maxX, maxY)],
        type: "FeatureCollection",
    };
}

function makeSquareFeature(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
): GeoJsonFeatureCollection["features"][number] {
    return {
        geometry: {
            coordinates: [
                [
                    [minX, minY],
                    [maxX, minY],
                    [maxX, maxY],
                    [minX, maxY],
                    [minX, minY],
                ],
            ],
            type: "Polygon",
        },
        properties: {},
        type: "Feature",
    };
}

function polygonArea(coords: Position[][][]): number {
    let total = 0;
    for (const polygon of coords) {
        for (const ring of polygon) {
            total += signedRingArea(ring);
        }
    }
    return Math.abs(total);
}

function hasHoles(coords: Position[][][]): boolean {
    return coords.some((polygon) => polygon.length > 1);
}

const PLAY_AREA = makeSquareFC(0, 0, 10, 10);
const PLAY_AREA_AREA = 100;

describe("buildCombinedInsideMask", () => {
    it("returns empty FeatureCollection when there are no cutouts", () => {
        const result = buildCombinedInsideMask(PLAY_AREA);

        expect(result.features).toHaveLength(0);
    });

    it("returns empty FeatureCollection when the play area has no polygons", () => {
        const emptyPlayArea: GeoJsonFeatureCollection = {
            features: [],
            type: "FeatureCollection",
        };
        const cutout = makeSquareFC(3, 3, 7, 7);

        const result = buildCombinedInsideMask(emptyPlayArea, cutout);

        expect(result.features).toHaveLength(0);
    });

    it("subtracts a single cutout from the play area", () => {
        const cutout = makeSquareFC(3, 3, 7, 7);

        const result = buildCombinedInsideMask(PLAY_AREA, cutout);

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.type).toBe("MultiPolygon");
        const coords = result.features[0].geometry
            .coordinates as Position[][][];
        expect(hasHoles(coords)).toBe(true);
        expect(polygonArea(coords)).toBeLessThan(PLAY_AREA_AREA);
        expect(polygonArea(coords)).toBeGreaterThan(0);
    });

    it("subtracts the intersection when two cutouts overlap", () => {
        const hidingZone = makeSquareFC(1, 1, 6, 6);
        const radarCircle = makeSquareFC(4, 4, 9, 9);

        const result = buildCombinedInsideMask(
            PLAY_AREA,
            hidingZone,
            radarCircle,
        );

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.type).toBe("MultiPolygon");
        const coords = result.features[0].geometry
            .coordinates as Position[][][];
        expect(hasHoles(coords)).toBe(true);
        const maskArea = polygonArea(coords);
        expect(maskArea).toBeLessThan(PLAY_AREA_AREA);
        // The intersection of [1,1]-[6,6] and [4,4]-[9,9] is [4,4]-[6,6]
        // area = 4. Play area area = 100. Mask area should be ~96.
        expect(maskArea).toBeGreaterThan(90);
    });

    it("returns the entire play area as mask when two cutouts do not overlap", () => {
        const cutout1 = makeSquareFC(1, 1, 3, 3);
        const cutout2 = makeSquareFC(7, 7, 9, 9);

        const result = buildCombinedInsideMask(PLAY_AREA, cutout1, cutout2);

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.type).toBe("MultiPolygon");
        const coords = result.features[0].geometry
            .coordinates as Position[][][];
        expect(hasHoles(coords)).toBe(false);
        expect(polygonArea(coords)).toBeCloseTo(PLAY_AREA_AREA, 1);
    });

    it("returns the entire play area as mask when one cutout does not overlap the others", () => {
        const cutout1 = makeSquareFC(1, 1, 6, 6);
        const cutout2 = makeSquareFC(4, 4, 9, 9);
        const cutout3 = makeSquareFC(8, 1, 9, 2);

        const result = buildCombinedInsideMask(
            PLAY_AREA,
            cutout1,
            cutout2,
            cutout3,
        );

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.type).toBe("MultiPolygon");
        const coords = result.features[0].geometry
            .coordinates as Position[][][];
        expect(hasHoles(coords)).toBe(false);
        expect(polygonArea(coords)).toBeCloseTo(PLAY_AREA_AREA, 1);
    });

    it("subtracts the intersection of all three cutouts when they all overlap", () => {
        const cutout1 = makeSquareFC(1, 1, 7, 7);
        const cutout2 = makeSquareFC(3, 3, 9, 9);
        const cutout3 = makeSquareFC(2, 4, 8, 6);

        const result = buildCombinedInsideMask(
            PLAY_AREA,
            cutout1,
            cutout2,
            cutout3,
        );

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.type).toBe("MultiPolygon");
        const coords = result.features[0].geometry
            .coordinates as Position[][][];
        expect(hasHoles(coords)).toBe(true);
        const maskArea = polygonArea(coords);
        expect(maskArea).toBeLessThan(PLAY_AREA_AREA);
        expect(maskArea).toBeGreaterThan(0);
    });

    it("can treat features in one collection as separate constraints", () => {
        const hitMasks: GeoJsonFeatureCollection = {
            features: [
                makeSquareFeature(1, 1, 6, 6),
                makeSquareFeature(4, 4, 9, 9),
            ],
            type: "FeatureCollection",
        };

        const result = buildCombinedInsideMask(
            PLAY_AREA,
            ...asSeparateMaskConstraints(hitMasks),
        );

        expect(result.features).toHaveLength(1);
        const coords = result.features[0].geometry
            .coordinates as Position[][][];
        // The hit intersection is [4,4]-[6,6], so only that area stays bright.
        expect(polygonArea(coords)).toBeCloseTo(96, 1);
    });
});

describe("buildCombinedEligibilityMask", () => {
    it("darkens miss areas while leaving the rest of the required zone eligible", () => {
        const hidingZone = makeSquareFC(1, 1, 9, 9);
        const miss = makeSquareFC(3, 3, 5, 5);

        const result = buildCombinedEligibilityMask(
            PLAY_AREA,
            [hidingZone],
            [miss],
        );

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.type).toBe("MultiPolygon");
        const coords = result.features[0].geometry
            .coordinates as Position[][][];
        expect(polygonArea(coords)).toBeCloseTo(40, 1);
    });

    it("combines hits and misses as required intersections minus excluded areas", () => {
        const hidingZone = makeSquareFC(1, 1, 9, 9);
        const hit = makeSquareFC(2, 2, 8, 8);
        const miss = makeSquareFC(4, 4, 6, 6);

        const result = buildCombinedEligibilityMask(
            PLAY_AREA,
            [hidingZone, hit],
            [miss],
        );

        expect(result.features).toHaveLength(1);
        const coords = result.features[0].geometry
            .coordinates as Position[][][];
        // Eligible area is [2,2]-[8,8] minus [4,4]-[6,6], so mask area is 68.
        expect(polygonArea(coords)).toBeCloseTo(68, 1);
    });

    it("uses one combined mask feature for misses without hit constraints", () => {
        const hidingZone = makeSquareFC(1, 1, 9, 9);
        const misses: GeoJsonFeatureCollection = {
            features: [
                makeSquareFeature(2, 2, 4, 4),
                makeSquareFeature(6, 6, 8, 8),
            ],
            type: "FeatureCollection",
        };

        const result = buildCombinedEligibilityMask(
            PLAY_AREA,
            [hidingZone],
            [misses],
        );

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.type).toBe("MultiPolygon");
        const coords = result.features[0].geometry
            .coordinates as Position[][][];
        expect(polygonArea(coords)).toBeCloseTo(44, 1);
    });

    it("does not reuse a cached mask for distinct polygons with similar starting coordinates", () => {
        const first = makeSquareFC(1.0001, 1.0001, 5, 5);
        const second = makeSquareFC(1.0002, 1.0002, 9, 9);

        const firstResult = buildCombinedEligibilityMask(PLAY_AREA, [first]);
        const secondResult = buildCombinedEligibilityMask(PLAY_AREA, [second]);
        const firstCoords = firstResult.features[0].geometry
            .coordinates as Position[][][];
        const secondCoords = secondResult.features[0].geometry
            .coordinates as Position[][][];

        expect(polygonArea(firstCoords)).toBeGreaterThan(
            polygonArea(secondCoords),
        );
    });

    it("reuses a cached mask for the same feature objects", () => {
        const hidingZone = makeSquareFC(1, 1, 9, 9);

        expect(buildCombinedEligibilityMask(PLAY_AREA, [hidingZone])).toBe(
            buildCombinedEligibilityMask(PLAY_AREA, [hidingZone]),
        );
    });
});

describe("buildPlayAreaMask", () => {
    it("creates a polygon with the world ring as exterior and play area as hole", () => {
        const boundary = makeSquareFC(139.5, 35.5, 140.0, 35.8);

        const result = buildPlayAreaMask(boundary);

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.type).toBe("Polygon");
        const coords = result.features[0].geometry.coordinates as Position[][];
        expect(coords.length).toBe(2);

        const outer = coords[0];
        const hole = coords[1];
        expect(signedRingArea(outer)).toBeGreaterThan(0);
        expect(signedRingArea(hole)).toBeLessThan(0);
    });

    it("reuses precomputed metadata for the bundled Tokyo mask", () => {
        expect(
            buildPlayAreaMaskFromMetadata(
                defaultPlayArea.boundary,
                defaultPlayArea.maskHoles!,
            ),
        ).toEqual(buildPlayAreaMask(defaultPlayArea.boundary));
    });
});
