import { bboxIntersects } from "../geojson";

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
