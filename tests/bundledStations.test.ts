import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";

import {
    BUNDLED_STATION_COUNT,
    getBundledStationPlaces,
} from "@/data/bundled-stations";

describe("bundled-stations", () => {
    it("returns the full set as valid StationPlace features when unscoped", () => {
        const places = getBundledStationPlaces(null);
        expect(places).toHaveLength(BUNDLED_STATION_COUNT);
        expect(BUNDLED_STATION_COUNT).toBeGreaterThan(900); // 264 subway + 700+ rail
        for (const p of places.slice(0, 50)) {
            expect(p.type).toBe("Feature");
            expect(p.geometry.type).toBe("Point");
            expect(p.geometry.coordinates).toHaveLength(2);
            expect(typeof p.properties.id).toBe("string");
            expect(p.properties.id.length).toBeGreaterThan(0);
        }
    });

    it("ids are unique (so downstream dedup keys correctly)", () => {
        const ids = getBundledStationPlaces(null).map((p) => p.properties.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("filters to a polygon scope", () => {
        // Tight box around Lower Manhattan — should keep some subway stations
        // and exclude the far-flung Amtrak/SEPTA/Vermont entries.
        const box: Feature<Polygon> = turf.bboxPolygon([
            -74.02, 40.7, -73.97, 40.73,
        ]) as Feature<Polygon>;
        const inBox = getBundledStationPlaces(box);
        expect(inBox.length).toBeGreaterThan(0);
        expect(inBox.length).toBeLessThan(BUNDLED_STATION_COUNT);
        // Every returned point must actually be inside the box.
        for (const p of inBox) {
            expect(
                turf.booleanPointInPolygon(turf.point(p.geometry.coordinates), box),
            ).toBe(true);
        }
    });

    it("returns empty for a region with no bundled coverage", () => {
        // Box over the Pacific — no NY-metro stations there.
        const box: Feature<Polygon> = turf.bboxPolygon([
            -140, 30, -135, 35,
        ]) as Feature<Polygon>;
        expect(getBundledStationPlaces(box)).toHaveLength(0);
    });
});
