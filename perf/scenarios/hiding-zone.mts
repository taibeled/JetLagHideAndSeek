import {
    buildHidingZoneFeatureCollection,
    buildRouteFeatureCollection,
    buildStationFeatureCollection,
    clearHidingZoneFeatureCache,
    getSelectedPresets,
    getSelectedStations,
} from "../../src/features/hidingZone/hidingZone.ts";
import type { HidingZonePreset } from "../../src/features/hidingZone/hidingZoneTypes.ts";
import { fixtureHash, readJson, repoPath, type PerfScenario } from "../lib.mts";

const presetFilename = repoPath("data/odpt/generated/hiding-zone-presets.json");
const presetData = readJson<{ presets: HidingZonePreset[] }>(presetFilename);
const tokyoStations = stationsFor(["tokyo-metro"]);
const toeiStations = stationsFor(["toei-subway"]);
const combinedStations = stationsFor(["tokyo-metro", "toei-subway"]);
const combinedMinusOne = combinedStations.slice(0, -1);

export const hidingZoneScenarios: PerfScenario[] = [
    {
        fixtureHash: fixtureHash(presetFilename),
        group: "hiding-zone",
        iterations: 20,
        name: "hiding-zone/combined-route-station-derivation",
        run: () => {
            const selected = getSelectedPresets(presetData.presets, [
                "tokyo-metro",
                "toei-subway",
            ]);
            const stations = getSelectedStations(selected);
            return {
                metrics: { stations: stations.length },
                output: {
                    routes: buildRouteFeatureCollection(selected),
                    stations: buildStationFeatureCollection(stations),
                },
            };
        },
        warmups: 3,
    },
    coldScenario("hiding-zone/tokyo-metro-600m-cold", tokyoStations, 600, 4),
    coldScenario("hiding-zone/toei-subway-600m-cold", toeiStations, 600, 4),
    coldScenario("hiding-zone/combined-300m-cold", combinedStations, 300, 4),
    coldScenario("hiding-zone/combined-600m-cold", combinedStations, 600, 3),
    coldScenario("hiding-zone/combined-1km-cold", combinedStations, 1000, 3),
    {
        fixtureHash: fixtureHash(presetFilename),
        group: "hiding-zone",
        iterations: 10,
        name: "hiding-zone/combined-600m-warm-exact",
        setup: () => {
            clearHidingZoneFeatureCache();
            buildHidingZoneFeatureCollection(combinedStations, 600);
        },
        run: () => ({
            metrics: { stations: combinedStations.length },
            output: buildHidingZoneFeatureCollection(combinedStations, 600),
        }),
        warmups: 2,
    },
    {
        fixtureHash: fixtureHash(presetFilename),
        group: "hiding-zone",
        iterations: 3,
        name: "hiding-zone/combined-600m-one-station-edit",
        setup: () => {
            clearHidingZoneFeatureCache();
            buildHidingZoneFeatureCollection(combinedStations, 600);
        },
        run: () => ({
            metrics: {
                editedStations: 1,
                stations: combinedMinusOne.length,
            },
            output: buildHidingZoneFeatureCollection(combinedMinusOne, 600),
        }),
        warmups: 1,
    },
    {
        fixtureHash: fixtureHash(presetFilename),
        group: "hiding-zone",
        iterations: 3,
        name: "hiding-zone/add-toei-preset-600m",
        setup: () => {
            clearHidingZoneFeatureCache();
            buildHidingZoneFeatureCollection(tokyoStations, 600);
        },
        run: () => ({
            metrics: { addedStations: toeiStations.length },
            output: buildHidingZoneFeatureCollection(combinedStations, 600),
        }),
        warmups: 1,
    },
    {
        fixtureHash: fixtureHash(presetFilename),
        group: "hiding-zone",
        iterations: 10,
        name: "hiding-zone/radius-return-600m",
        setup: () => {
            clearHidingZoneFeatureCache();
            buildHidingZoneFeatureCollection(combinedStations, 600);
            buildHidingZoneFeatureCollection(combinedStations, 1000);
        },
        run: () => ({
            metrics: { stations: combinedStations.length },
            output: buildHidingZoneFeatureCollection(combinedStations, 600),
        }),
        warmups: 2,
    },
];

function stationsFor(ids: string[]) {
    return getSelectedStations(getSelectedPresets(presetData.presets, ids));
}

function coldScenario(
    name: string,
    stations: ReturnType<typeof stationsFor>,
    radiusMeters: number,
    iterations: number,
): PerfScenario {
    return {
        fixtureHash: fixtureHash(presetFilename),
        group: "hiding-zone",
        iterations,
        name,
        run: () => ({
            metrics: { radiusMeters, stations: stations.length },
            output: buildHidingZoneFeatureCollection(stations, radiusMeters),
        }),
        setup: clearHidingZoneFeatureCache,
        warmups: 1,
    };
}
