import type { LatLngTuple } from "leaflet";
import { describe, expect, it } from "vitest";

import {
    convertToLatLong,
    convertToLongLat,
    determineName,
    prettifyLocation,
} from "@/maps/api/geo";
import type { APILocations, OpenStreetMap } from "@/maps/api/types";

describe("convertToLongLat", () => {
    it("converts valid LatLngTuple to [lng, lat] array", () => {
        const input: LatLngTuple = [35, 139];
        const result = convertToLongLat(input);
        expect(result).toEqual([139, 35]);
    });

    it("handles negative coordinates", () => {
        const input: LatLngTuple = [-33, -151];
        const result = convertToLongLat(input);
        expect(result).toEqual([-151, -33]);
    });
});

describe("convertToLatLong", () => {
    it("converts valid [lng, lat] array to LatLngTuple", () => {
        const input = [139, 35];
        const result = convertToLatLong(input);
        expect(result).toEqual([35, 139]);
    });

    it("handles negative coordinates", () => {
        const input = [-151, -33];
        const result = convertToLatLong(input);
        expect(result).toEqual([-33, -151]);
    });

    it("round-trip conversion maintains values", () => {
        const original: LatLngTuple = [48.8566, 2.3522];
        const longLat = convertToLongLat(original);
        const roundTripped = convertToLatLong(longLat);
        expect(roundTripped).toEqual(original);
    });
});

describe("prettifyLocation", () => {
    describe("prettifies singular forms", () => {
        const singularCases: [APILocations, string][] = [
            ["aquarium", "Aquarium"],
            ["hospital", "Hospital"],
            ["peak", "Mountain"],
            ["museum", "Museum"],
            ["theme_park", "Theme Park"],
            ["zoo", "Zoo"],
            ["cinema", "Cinema"],
            ["library", "Library"],
            ["golf_course", "Golf Course"],
            ["consulate", "Foreign Consulate"],
            ["park", "Park"],
        ];
        it.each(singularCases)(
            "input: %s, expected: %s",
            (input: APILocations, expected: string) => {
                expect(prettifyLocation(input)).toBe(expected);
            },
        );
    });

    describe("prettifies plural forms", () => {
        const pluralCases: [APILocations, string][] = [
            ["aquarium", "Aquariums"],
            ["hospital", "Hospitals"],
            ["peak", "Mountains"],
            ["museum", "Museums"],
            ["theme_park", "Theme Parks"],
            ["zoo", "Zoos"],
            ["cinema", "Cinemas"],
            ["library", "Libraries"],
            ["golf_course", "Golf Courses"],
            ["consulate", "Foreign Consulates"],
            ["park", "Parks"],
        ];
        it.each(pluralCases)(
            "input: %s, expected: %s",
            (input: APILocations, expected: string) => {
                expect(prettifyLocation(input, true)).toBe(expected);
            },
        );
    });
});

describe("determineName", () => {
    it("handles R-type features with state and country", () => {
        const feature: OpenStreetMap = {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [139.6503, 35.6762],
            },
            properties: {
                osm_type: "R",
                osm_id: 12345,
                country: "Japan",
                state: "Tokyo",
                osm_key: "place",
                countrycode: "JP",
                osm_value: "city",
                name: "Shibuya",
                type: "district",
            },
        };
        expect(determineName(feature)).toBe("Shibuya, Tokyo, Japan");
    });

    it("handles non-R-type features with housenumber/street/city", () => {
        const feature: OpenStreetMap = {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [139.7, 35.68],
            },
            properties: {
                osm_type: "N",
                osm_id: 67890,
                country: "Japan",
                state: "Tokyo",
                osm_key: "amenity",
                countrycode: "JP",
                osm_value: "restaurant",
                name: "Test Place",
                type: "restaurant",
                housenumber: "3",
                street: "Main Street",
                city: "Tokyo",
            } as any,
        };
        expect(determineName(feature)).toBe(
            "3 Main Street, Tokyo, Tokyo, Japan",
        );
    });

    it("handles non-R-type with street but no housenumber", () => {
        const feature: OpenStreetMap = {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [0, 0],
            },
            properties: {
                osm_type: "W",
                osm_id: 33333,
                country: "Germany",
                osm_key: "amenity",
                countrycode: "DE",
                osm_value: "cafe",
                name: "Cafe",
                type: "cafe",
                street: "Hauptstrasse",
                city: "Berlin",
            } as any,
        };
        expect(determineName(feature)).toBe("Hauptstrasse, Berlin, Germany");
    });
});
