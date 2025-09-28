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
        const radius = 10000; // super wide radius to ensure all locations are in
        const units: turf.Units = "kilometers";

        const result = mergeDuplicateStation(places, radius, units);
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
        const radius = 10000; // super wide radius to ensure all locations are in
        const units: turf.Units = "kilometers";

        const result = mergeDuplicateStation(places, radius, units);
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
        const radius = 10000; // super wide radius to ensure all locations are in
        const units: turf.Units = "kilometers";

        const result = mergeDuplicateStation(places, radius, units);
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
        const radius = 10000; // super wide radius to ensure all locations are in
        const units: turf.Units = "kilometers";

        const result = mergeDuplicateStation(places, radius, units);
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
        const radius = 10000; // super wide radius to ensure all locations are in
        const units: turf.Units = "kilometers";

        const result = mergeDuplicateStation(places, radius, units);
        expect(result).toHaveLength(3);

        // Make sure the coordinates are preserved exactly
        expect(result.map((r) => r.geometry.coordinates)).toEqual([
            [10, 50],
            [20, -30],
            [-40, 60],
        ]);
    });

    it("returns 3 individual zones when 6 Jan van Galenstraat stations are added, where only 2 stations share the actual zone", () => {
        const places = [
            {
                // West station 1:      https://www.openstreetmap.org/node/3306520727
                geometry: {
                    type: "Point",
                    coordinates: [4.8350051, 52.3732337],
                },
                properties: { name: "Jan van Galenstraat" },
            },
            {
                // West station 2:      https://www.openstreetmap.org/node/434662863
                geometry: {
                    type: "Point",
                    coordinates: [4.8359077, 52.3730297],
                },
                properties: { name: "Jan van Galenstraat" },
            },
            {
                // Center station 1:    https://www.openstreetmap.org/node/434700014
                geometry: {
                    type: "Point",
                    coordinates: [4.8485891, 52.3733319],
                },
                properties: { name: "Jan van Galenstraat" },
            },
            {
                // Center station 2:    https://www.openstreetmap.org/node/3300515588
                geometry: {
                    type: "Point",
                    coordinates: [4.8487242, 52.3729826],
                },
                properties: { name: "Jan van Galenstraat" },
            },
            {
                // East station 1:      https://www.openstreetmap.org/node/434397634
                geometry: {
                    type: "Point",
                    coordinates: [4.8584711, 52.3751323],
                },
                properties: { name: "Jan van Galenstraat" },
            },
            {
                // East station 2:      https://www.openstreetmap.org/node/434397635
                geometry: {
                    type: "Point",
                    coordinates: [4.8586427, 52.3743002],
                },
                properties: { name: "Jan van Galenstraat" },
            },
        ];
        const radius = 0.5;
        const units: turf.Units = "kilometers";

        const result = mergeDuplicateStation(places, radius, units);
        // We expect 3 stations, because the 3 pairs are very far apart
        expect(result).toHaveLength(3);
    });
});

import { checkIfStationsShareZones } from "../src/maps/geo-utils/stationManipulations";
import type { Location } from "../src/maps/geo-utils/stationManipulations";
import * as turf from "@turf/turf";

describe("checkIfStationsShareZones", () => {
    it("returns true that Jan van Galenstraat subway station and nearby tram station share zones with km as unit", () => {
        // Subway station:      https://www.openstreetmap.org/node/250224485
        const station1: Location = {
            coordinates: [4.8352937, 52.3726582],
        };
        // Nearby tram station: https://www.openstreetmap.org/node/3306520727
        const station2: Location = {
            coordinates: [4.8350051, 52.3732337],
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
            coordinates: [4.8352937, 52.3726582],
        };
        // Far away tram station: https://www.openstreetmap.org/node/3300515588
        const station2: Location = {
            coordinates: [4.8487242, 52.3729826],
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
            coordinates: [4.8352937, 52.3726582],
        };
        // Far away tram station: https://www.openstreetmap.org/node/3300515588
        const station2: Location = {
            coordinates: [4.8487242, 52.3729826],
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
