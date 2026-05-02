import * as turf from "@turf/turf";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/maps/api", () => ({
    determineMapBoundaries: vi.fn(),
}));

vi.mock("./playAreaMode", async () => {
    const actual = await vi.importActual<typeof import("./playAreaMode")>(
        "./playAreaMode",
    );
    return {
        ...actual,
        detectPlayAreaMode: vi.fn(async () => "japan"),
    };
});

import { determineMapBoundaries } from "@/maps/api";

import {
    mapGeoLocation,
    playAreaMode,
    polyGeoJSON,
    refreshPlayAreaModeFromCurrentLocations,
    refreshPlayAreaModeFromGeometry,
} from "./context";
import { detectPlayAreaMode } from "./playAreaMode";

const stubWindow = () => {
    (globalThis as typeof globalThis & {
        window: unknown;
        localStorage: unknown;
    }).window = {};
    (globalThis as typeof globalThis & {
        window: unknown;
        localStorage: unknown;
    }).localStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
    };
};

afterEach(() => {
    polyGeoJSON.set(null);
    playAreaMode.set("default");
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { window?: unknown }).window;
    delete (globalThis as typeof globalThis & { localStorage?: unknown })
        .localStorage;
});

describe("play area mode refresh", () => {
    it("does not fetch boundaries when a polygon play area is already active", async () => {
        stubWindow();

        polyGeoJSON.set(
            turf.featureCollection([
                turf.polygon([
                    [
                        [139.6, 35.6],
                        [139.8, 35.6],
                        [139.8, 35.8],
                        [139.6, 35.8],
                        [139.6, 35.6],
                    ],
                ]),
            ]),
        );
        mapGeoLocation.set({
            type: "Feature",
            geometry: { type: "Point", coordinates: [139.7, 35.7] },
            properties: {
                osm_type: "R",
                osm_id: 1,
                osm_key: "place",
                countrycode: "JP",
                osm_value: "city",
                name: "Test",
                type: "city",
            },
        } as never);

        await refreshPlayAreaModeFromCurrentLocations();

        expect(determineMapBoundaries).not.toHaveBeenCalled();
    });

    it("uses geometry directly when a play area polygon is provided", async () => {
        stubWindow();

        const playArea = turf.featureCollection([
            turf.polygon([
                [
                    [139.6, 35.6],
                    [139.8, 35.6],
                    [139.8, 35.8],
                    [139.6, 35.8],
                    [139.6, 35.6],
                ],
            ]),
        ]);

        await refreshPlayAreaModeFromGeometry(playArea);

        expect(detectPlayAreaMode).toHaveBeenCalledTimes(1);
        expect(detectPlayAreaMode).toHaveBeenCalledWith(playArea);
        expect(playAreaMode.get()).toBe("japan");
    });
});
