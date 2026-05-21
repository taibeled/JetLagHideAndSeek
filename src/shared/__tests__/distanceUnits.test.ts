import {
    METERS_PER_KM,
    METERS_PER_MILE,
    formatDistanceValue,
    fromMeters,
    toMeters,
} from "../distanceUnits";

describe("distanceUnits", () => {
    it("converts display values to meters", () => {
        expect(toMeters("600", "m")).toBe(600);
        expect(toMeters("0.6", "km")).toBe(600);
        expect(toMeters("1", "km")).toBe(METERS_PER_KM);
        expect(toMeters("1", "mi")).toBe(METERS_PER_MILE);
    });

    it("rejects invalid display values", () => {
        expect(toMeters("", "m")).toBeNull();
        expect(toMeters("0", "m")).toBeNull();
        expect(toMeters("-1", "km")).toBeNull();
        expect(toMeters("abc", "mi")).toBeNull();
    });

    it("formats meters for each display unit", () => {
        expect(fromMeters(600, "m")).toBe("600");
        expect(fromMeters(600, "km")).toBe("0.60");
        expect(fromMeters(METERS_PER_MILE, "mi")).toBe("1");
    });

    it("uses compact distance formatting by default", () => {
        expect(formatDistanceValue(10.25)).toBe("10.3");
        expect(formatDistanceValue(2.345)).toBe("2.35");
        expect(formatDistanceValue(2.345, 1)).toBe("2.3");
    });
});
