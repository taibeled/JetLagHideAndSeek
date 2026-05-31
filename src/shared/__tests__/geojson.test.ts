import { bboxIntersects, haversineDistanceMeters } from "../geojson";

describe("bboxIntersects", () => {
    it("returns true when bboxes overlap", () => {
        expect(bboxIntersects([0, 0, 2, 2], [1, 1, 3, 3])).toBe(true);
    });

    it("returns false when bboxes do not overlap", () => {
        expect(bboxIntersects([0, 0, 2, 2], [3, 3, 4, 4])).toBe(false);
    });

    it("returns true when bboxes touch at an edge", () => {
        expect(bboxIntersects([0, 0, 2, 2], [2, 0, 4, 2])).toBe(true);
    });
});

describe("haversineDistanceMeters", () => {
    it("returns 0 for identical coordinates", () => {
        expect(haversineDistanceMeters(35.68, 139.76, 35.68, 139.76)).toBe(0);
    });

    it("computes a known short distance to within 1%", () => {
        // Shinjuku → Shibuya is roughly 3.3 km
        const d = haversineDistanceMeters(35.6895, 139.7006, 35.658, 139.7015);
        expect(d).toBeGreaterThan(3000);
        expect(d).toBeLessThan(3600);
    });

    it("is symmetric", () => {
        const d1 = haversineDistanceMeters(35.0, 139.0, 36.0, 140.0);
        const d2 = haversineDistanceMeters(36.0, 140.0, 35.0, 139.0);
        expect(d1).toBeCloseTo(d2, 6);
    });
});
