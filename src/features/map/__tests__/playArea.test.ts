import { calculateBbox, defaultPlayArea } from "../playArea";

describe("defaultPlayArea", () => {
    it("uses Tokyo 23 Wards as the default OSM relation", () => {
        expect(defaultPlayArea.label).toBe("Tokyo 23 Wards");
        expect(defaultPlayArea.osmId).toBe(19631009);
        expect(defaultPlayArea.osmType).toBe("R");
    });

    it("loads a valid Tokyo 23 wards boundary feature collection", () => {
        expect(defaultPlayArea.boundary.type).toBe("FeatureCollection");
        expect(defaultPlayArea.boundary.features).toHaveLength(1);
        expect(defaultPlayArea.boundary.features[0].geometry.type).toBe(
            "MultiPolygon",
        );
    });

    it("calculates the expected Tokyo bbox", () => {
        expect(calculateBbox(defaultPlayArea.boundary)).toEqual([
            139.5628986, 35.4816556, 139.9189004, 35.8174937,
        ]);
    });
});
