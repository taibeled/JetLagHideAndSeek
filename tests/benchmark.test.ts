import { readFileSync } from "node:fs";
import path from "node:path";

import type { Feature, FeatureCollection, Polygon } from "geojson";
import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";

import { safeUnion } from "@/maps/geo-utils";
import { applyQuestionsToMapGeoData } from "@/maps";
import { questionsSchema } from "@/maps/schema";
import { canonicalize } from "@/lib/wire";

import wireFixture from "./fixtures/wire-v1.json";

function makeSquare(offset: number): Feature<Polygon> {
    return {
        type: "Feature",
        properties: {},
        geometry: {
            type: "Polygon",
            coordinates: [[
                [offset, offset],
                [offset + 0.01, offset],
                [offset + 0.01, offset + 0.01],
                [offset, offset + 0.01],
                [offset, offset],
            ]],
        },
    };
}

describe.skip("benchmarks", () => {
    it("applyQuestionsToMapGeoData with 10 matching questions (<500ms)", async () => {
        const questions = Array.from({ length: 10 }, (_, i) => ({
            id: "radius" as const,
            key: i,
            data: {
                lat: 35.0 + i * 0.1,
                lng: 139.0 + i * 0.1,
                radius: 50,
                unit: "miles" as const,
                within: true,
                drag: true,
            },
        }));
        const parsed = questionsSchema.parse(questions);
        const mapData: FeatureCollection = {
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                properties: {},
                geometry: {
                    type: "Point",
                    coordinates: [139.0, 35.0],
                },
            }],
        };

        const start = performance.now();
        await applyQuestionsToMapGeoData(parsed, mapData, false);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(500);
    });

    it("safeUnion on 100 overlapping polygons (<1s)", () => {
        const squares: FeatureCollection<Polygon> = {
            type: "FeatureCollection",
            features: Array.from({ length: 100 }, (_, i) => makeSquare(i * 0.001)),
        };

        const start = performance.now();
        safeUnion(squares);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(1000);
    });

    it("canonicalize on full wire payload (<10ms)", () => {
        const start = performance.now();
        canonicalize(wireFixture);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(10);
    });

    it("coastline loading + processing (<1s)", () => {
        const coastlinePath = path.resolve(
            import.meta.dirname,
            "../public/coastline50.geojson",
        );
        const raw = readFileSync(coastlinePath, "utf-8");

        const start = performance.now();
        const parsed = JSON.parse(raw);
        const reStringified = JSON.stringify(parsed);
        const end = performance.now();

        expect(parsed).toBeDefined();
        expect(parsed.features).toBeDefined();
        expect(reStringified).toBeDefined();
        expect(end - start).toBeLessThan(1000);
    });
});
