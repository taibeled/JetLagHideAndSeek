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

import { checkIfStationsShareZones } from "../src/maps/geo-utils/stationManipulations";
import type { Location } from "../src/maps/geo-utils/stationManipulations";
import * as turf from "@turf/turf";

describe("checkIfStationsShareZones", () => {
    it("returns true that Jan van Galenstraat subway station and nearby tram station share zones with km as unit", () => {
        // Subway station:      https://www.openstreetmap.org/node/250224485
        const station1: Location = {
            coordinates: [52.3726582, 4.8352937],
        };
        // Nearby tram station: https://www.openstreetmap.org/node/3306520727
        const station2: Location = {
            coordinates: [52.3732337, 4.8350051],
        };
        const radius: number = 0.5; //km
        const units: turf.Units = "kilometers";
        const result = checkIfStationsShareZones(
            station1,
            station2,
            radius,
            units,
        );
        expect(result).true;
    });

    it("returns false that Jan van Galenstraat subway station and far away tram station share zones with km as unit", () => {
        // Subway station:      https://www.openstreetmap.org/node/250224485
        const station1: Location = {
            coordinates: [52.3726582, 4.8352937],
        };
        // Far away tram station: https://www.openstreetmap.org/node/3300515588
        const station2: Location = {
            coordinates: [52.3729826, 4.8487242],
        };
        const radius: number = 0.5; //km
        const units: turf.Units = "kilometers";
        const result = checkIfStationsShareZones(
            station1,
            station2,
            radius,
            units,
        );
        expect(result).false;
    });

    it("returns false that Jan van Galenstraat subway station and far away tram station share zones with miles as unit", () => {
        // Subway station:      https://www.openstreetmap.org/node/250224485
        const station1: Location = {
            coordinates: [52.3726582, 4.8352937],
        };
        // Far away tram station: https://www.openstreetmap.org/node/3300515588
        const station2: Location = {
            coordinates: [52.3729826, 4.8487242],
        };
        const radius: number = 0.5; //km
        const units: turf.Units = "miles";
        const result = checkIfStationsShareZones(
            station1,
            station2,
            radius,
            units,
        );
        expect(result).false;
    });
});
