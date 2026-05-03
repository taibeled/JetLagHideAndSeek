import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
    determineUnionizedStrings,
    matchingQuestionSchema,
    measuringQuestionSchema,
    questionsSchema,
    tentacleQuestionSchema,
} from "@/maps/schema";

const VALID_COLORS = [
    "black",
    "blue",
    "gold",
    "green",
    "grey",
    "orange",
    "red",
    "violet",
];

describe("questionsSchema", () => {
    test("parses a radius question", () => {
        const result = questionsSchema.parse([
            {
                id: "radius",
                key: 0,
                data: {
                    lat: 34.0,
                    lng: -118.0,
                    radius: 100,
                    unit: "miles",
                    within: false,
                },
            },
        ]);

        expect(result).toHaveLength(1);
        const q = result[0]!;
        expect(q.id).toBe("radius");
        if (q.id !== "radius") {
            throw new Error("Expected radius question");
        }
        expect(q.data.lat).toBe(34.0);
        expect(q.data.lng).toBe(-118.0);
        expect(q.data.radius).toBe(100);
        expect(q.data.unit).toBe("miles");
        expect(q.data.within).toBe(false);
    });

    test("parses a thermometer question", () => {
        const result = questionsSchema.parse([
            {
                id: "thermometer",
                key: 0,
                data: {
                    latA: 40.0,
                    lngA: -74.0,
                    latB: 41.0,
                    lngB: -73.0,
                    warmer: false,
                },
            },
        ]);

        expect(result).toHaveLength(1);
        const q = result[0]!;
        expect(q.id).toBe("thermometer");
        if (q.id !== "thermometer") {
            throw new Error("Expected thermometer question");
        }
        expect(q.data.latA).toBe(40.0);
        expect(q.data.lngA).toBe(-74.0);
        expect(q.data.latB).toBe(41.0);
        expect(q.data.lngB).toBe(-73.0);
        expect(q.data.warmer).toBe(false);
    });

    test("parses a tentacle question", () => {
        const result = questionsSchema.parse([
            {
                id: "tentacles",
                key: 0,
                data: {
                    lat: 35.0,
                    lng: 139.0,
                    radius: 15,
                    unit: "kilometers",
                    locationType: "museum",
                    location: false,
                },
            },
        ]);

        expect(result).toHaveLength(1);
        const q = result[0]!;
        expect(q.id).toBe("tentacles");
        if (q.id !== "tentacles") {
            throw new Error("Expected tentacles question");
        }
        expect(q.data.lat).toBe(35.0);
        expect(q.data.lng).toBe(139.0);
        expect(q.data.radius).toBe(15);
        expect(q.data.unit).toBe("kilometers");
        expect(q.data.locationType).toBe("museum");
        expect(q.data.location).toBe(false);
    });

    test("parses an ordinary measuring question", () => {
        const result = questionsSchema.parse([
            {
                id: "measuring",
                key: 0,
                data: {
                    lat: 48.0,
                    lng: 2.0,
                    type: "coastline",
                    unit: "meters",
                },
            },
        ]);

        expect(result).toHaveLength(1);
        const q = result[0]!;
        expect(q.id).toBe("measuring");
        if (q.id !== "measuring") {
            throw new Error("Expected measuring question");
        }
        expect(q.data.lat).toBe(48.0);
        expect(q.data.lng).toBe(2.0);
        expect(q.data.type).toBe("coastline");
    });

    test("parses a custom measuring question", () => {
        const geo = {
            type: "LineString",
            coordinates: [
                [0, 0],
                [1, 1],
            ],
        };

        const result = questionsSchema.parse([
            {
                id: "measuring",
                key: 0,
                data: {
                    lat: 48.0,
                    lng: 2.0,
                    type: "custom-measure",
                    unit: "kilometers",
                    geo,
                },
            },
        ]);

        expect(result).toHaveLength(1);
        const q = result[0]!;
        expect(q.id).toBe("measuring");
        if (q.id !== "measuring") {
            throw new Error("Expected measuring question");
        }
        expect(q.data.type).toBe("custom-measure");
        if (q.data.type !== "custom-measure") {
            throw new Error("Expected custom measuring question");
        }
        expect(q.data.geo).toEqual(geo);
    });

    test("parses an array of mixed question types", () => {
        const result = questionsSchema.parse([
            {
                id: "radius",
                key: 0,
                data: { lat: 34.0, lng: -118.0 },
            },
            {
                id: "matching",
                key: 1,
                data: {
                    lat: 35.0,
                    lng: 139.0,
                    type: "airport",
                    same: true,
                },
            },
            {
                id: "thermometer",
                key: 2,
                data: {
                    latA: 40.0,
                    lngA: -74.0,
                    latB: 41.0,
                    lngB: -73.0,
                },
            },
        ]);

        expect(result).toHaveLength(3);
        expect(result[0].id).toBe("radius");
        expect(result[1].id).toBe("matching");
        expect(result[2].id).toBe("thermometer");
    });

    test("rejects an unknown question id", () => {
        expect(() =>
            questionsSchema.parse([
                {
                    id: "bogus",
                    key: 0,
                    data: { lat: 0, lng: 0 },
                },
            ]),
        ).toThrow();
    });

    test("populates defaults when fields are omitted", () => {
        const result = questionsSchema.parse([
            {
                id: "radius",
                key: 0,
                data: { lat: 0, lng: 0 },
            },
        ]);

        expect(result).toHaveLength(1);
        const q = result[0]!;
        expect(q.id).toBe("radius");
        if (q.id !== "radius") {
            throw new Error("Expected radius question");
        }

        expect(typeof q.key).toBe("number");

        expect(typeof q.data.drag).toBe("boolean");
        expect(q.data.drag).toBe(true);

        expect(typeof q.data.collapsed).toBe("boolean");
        expect(q.data.collapsed).toBe(false);

        expect(typeof q.data.radius).toBe("number");
        expect(q.data.radius).toBe(50);

        expect(q.data.unit).toBe("miles");

        expect(typeof q.data.within).toBe("boolean");
        expect(q.data.within).toBe(true);
    });

    test("color field defaults to a valid color when omitted", () => {
        const result = questionsSchema.parse([
            {
                id: "radius",
                key: 0,
                data: { lat: 0, lng: 0 },
            },
        ]);

        const q = result[0]!;
        expect(q.id).toBe("radius");
        if (q.id !== "radius") {
            throw new Error("Expected radius question");
        }
        const color = q.data.color;
        expect(typeof color).toBe("string");
        expect(color.length).toBeGreaterThan(0);
        expect(VALID_COLORS).toContain(color);
    });
});

describe("determineUnionizedStrings", () => {
    test("returns literal union strings from a union of literals", () => {
        const schema = z.union([
            z.literal("airport").describe("Airport"),
            z.literal("zoo").describe("Zoo"),
            z.literal("park").describe("Park"),
        ]);

        const result = determineUnionizedStrings(schema);

        expect(result).toHaveLength(3);

        const defs = result.map((r) => (r as any)._def);
        const values = defs.map((d: any) => d.value);
        const descs = defs.map((d: any) => d.description);

        expect(values).toEqual(["airport", "zoo", "park"]);
        expect(descs).toEqual(["Airport", "Zoo", "Park"]);
    });

    test("handles ZodDefault wrapping a union of literals", () => {
        const schema = z
            .union([
                z.literal("coastline").describe("Coastline"),
                z.literal("city").describe("City"),
            ])
            .default("coastline");

        const result = determineUnionizedStrings(schema);

        expect(result).toHaveLength(2);

        const defs = result.map((r) => (r as any)._def);
        const values = defs.map((d: any) => d.value);

        expect(values).toEqual(["coastline", "city"]);
    });

    test("returns empty array for non-union, non-literal input", () => {
        const result = determineUnionizedStrings(z.string() as any);
        expect(result).toEqual([]);
    });

    test("handles matchingQuestionSchema inner type unions", () => {
        const allLiterals: z.ZodLiteral<any>[] = [];

        for (const opt of matchingQuestionSchema._def.options) {
            allLiterals.push(
                ...determineUnionizedStrings(opt.shape.type),
            );
        }

        const values = allLiterals.map((r) => (r._def as any).value);
        expect(values).toContain("airport");
        expect(values).toContain("major-city");
        expect(values).toContain("zone");
        expect(values).toContain("letter-zone");
        expect(values).toContain("custom-zone");
        expect(values).toContain("custom-points");
        expect(values).toContain("same-train-line");
        expect(values).toContain("same-length-station");
        expect(values).toContain("same-first-letter-station");
        expect(values).toContain("aquarium");
        expect(values).toContain("park");
    });

    test("handles tentacleQuestionSchema inner locationType unions", () => {
        const allLiterals: z.ZodLiteral<any>[] = [];

        for (const opt of tentacleQuestionSchema._def.options) {
            allLiterals.push(
                ...determineUnionizedStrings(opt.shape.locationType),
            );
        }

        const values = allLiterals.map((r) => (r._def as any).value);
        expect(values).toContain("theme_park");
        expect(values).toContain("zoo");
        expect(values).toContain("aquarium");
        expect(values).toContain("museum");
        expect(values).toContain("hospital");
        expect(values).toContain("cinema");
        expect(values).toContain("library");
        expect(values).toContain("custom");
    });

    test("handles measuringQuestionSchema inner type unions", () => {
        const allLiterals: z.ZodLiteral<any>[] = [];

        for (const opt of measuringQuestionSchema._def.options) {
            allLiterals.push(
                ...determineUnionizedStrings(opt.shape.type),
            );
        }

        const values = allLiterals.map((r) => (r._def as any).value);
        expect(values).toContain("coastline");
        expect(values).toContain("airport");
        expect(values).toContain("city");
        expect(values).toContain("custom-measure");
        expect(values).toContain("mcdonalds");
        expect(values).toContain("seven11");
        expect(values).toContain("rail-measure");
    });
});
