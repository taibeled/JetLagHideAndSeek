import { describe, it, expect } from "vitest";

import { mergeDuplicateStation } from "../src/maps/geo-utils/stationManipulations";

describe("mergeDuplicateStation", () => {
    it("merges duplicates in the eastern hemisphere", () => {
        const places = [
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [120, 10] },
                properties: { name: "Station East" },
            },
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [122, 12] },
                properties: { name: "Station East" },
            },
        ];

        const result = mergeDuplicateStation(places);
        expect(result).toHaveLength(1);
        expect(result[0].geometry.coordinates).toEqual([121, 11]); // average
    });

    it("merges duplicates in the western hemisphere", () => {
        const places = [
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [-80, 25] },
                properties: { name: "Station West" },
            },
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [-82, 23] },
                properties: { name: "Station West" },
            },
        ];

        const result = mergeDuplicateStation(places);
        expect(result).toHaveLength(1);
        expect(result[0].geometry.coordinates).toEqual([-81, 24]);
    });

    it("merges duplicates in the southern hemisphere", () => {
        const places = [
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [30, -20] },
                properties: { name: "Station South" },
            },
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [32, -22] },
                properties: { name: "Station South" },
            },
        ];

        const result = mergeDuplicateStation(places);
        expect(result).toHaveLength(1);
        expect(result[0].geometry.coordinates).toEqual([31, -21]);
    });

    it("handles 3 or more duplicates", () => {
        const places = [
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [10, 10] },
                properties: { name: "Station Multi" },
            },
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [20, 20] },
                properties: { name: "Station Multi" },
            },
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [30, 30] },
                properties: { name: "Station Multi" },
            },
        ];

        const result = mergeDuplicateStation(places);
        expect(result).toHaveLength(1);
        expect(result[0].geometry.coordinates).toEqual([20, 20]); // average of 10,20,30
    });

    it("returns all places unchanged when all names are unique", () => {
        const places = [
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [10, 50] },
                properties: { name: "Unique A" },
            },
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [20, -30] },
                properties: { name: "Unique B" },
            },
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [-40, 60] },
                properties: { name: "Unique C" },
            },
        ];

        const result = mergeDuplicateStation(places);
        expect(result).toHaveLength(3);

        // Make sure the coordinates are preserved exactly
        expect(result.map((r) => r.geometry.coordinates)).toEqual([
            [10, 50],
            [20, -30],
            [-40, 60],
        ]);
    });
});
