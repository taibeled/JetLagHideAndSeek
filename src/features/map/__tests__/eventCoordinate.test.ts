import {
    getCoordinateFromArray,
    getEventCoordinate,
    isRecord,
} from "../eventCoordinate";

describe("getCoordinateFromArray", () => {
    it("returns valid lon/lat pairs", () => {
        expect(getCoordinateFromArray([139.65, 35.67])).toEqual([
            139.65, 35.67,
        ]);
    });

    it("rejects out-of-range coordinates", () => {
        expect(getCoordinateFromArray([200, 35])).toBeNull();
        expect(getCoordinateFromArray([139, 100])).toBeNull();
    });

    it("rejects non-finite values", () => {
        expect(getCoordinateFromArray([NaN, 35])).toBeNull();
        expect(getCoordinateFromArray([139, Infinity])).toBeNull();
    });
});

describe("getEventCoordinate", () => {
    it("reads longitude/latitude objects", () => {
        expect(
            getEventCoordinate({
                coordinates: { latitude: 35.67, longitude: 139.65 },
            }),
        ).toEqual([139.65, 35.67]);
    });

    it("reads coordinate arrays", () => {
        expect(
            getEventCoordinate({
                coordinates: [139.65, 35.67],
            }),
        ).toEqual([139.65, 35.67]);
    });

    it("reads geometry coordinates", () => {
        expect(
            getEventCoordinate({
                geometry: { coordinates: [139.65, 35.67] },
            }),
        ).toEqual([139.65, 35.67]);
    });

    it("recurses through nativeEvent", () => {
        expect(
            getEventCoordinate({
                nativeEvent: {
                    geometry: { coordinates: [139.65, 35.67] },
                },
            }),
        ).toEqual([139.65, 35.67]);
    });

    it("recurses through payload", () => {
        expect(
            getEventCoordinate({
                payload: {
                    coordinates: { latitude: 35.67, longitude: 139.65 },
                },
            }),
        ).toEqual([139.65, 35.67]);
    });

    it("returns null for invalid input", () => {
        expect(getEventCoordinate(null)).toBeNull();
        expect(getEventCoordinate("bad")).toBeNull();
        expect(getEventCoordinate({})).toBeNull();
    });
});

describe("isRecord", () => {
    it("narrows object types", () => {
        expect(isRecord({ a: 1 })).toBe(true);
        expect(isRecord(null)).toBe(false);
        expect(isRecord([])).toBe(false);
    });
});
