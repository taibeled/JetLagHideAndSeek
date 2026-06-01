import osakaBoundary from "../../assets/default-zones/osaka.json";

import {
    buildPlayAreaMask,
    buildPlayAreaMaskFromMetadata,
} from "../../src/features/map/maskBuilder.ts";
import type { GeoJsonFeatureCollection } from "../../src/features/map/geojsonTypes.ts";
import {
    calculateBbox,
    defaultPlayArea,
} from "../../src/features/map/playArea.ts";
import { buildPlayAreaFromOverpass } from "../../src/features/map/playAreaBoundaryConversion.ts";
import {
    fixtureHash,
    loadCapture,
    perfPath,
    type PerfScenario,
} from "../lib.mts";

const vaticanCapture = perfPath(
    "fixtures/overpass/boundaries/vatican-city-36989.json",
);
const monacoCapture = perfPath(
    "fixtures/overpass/boundaries/monaco-1124039.json",
);
const vaticanRaw = loadCapture(vaticanCapture).payload;
const monacoRaw = loadCapture(monacoCapture).payload;

const syntheticBoundaryEntries = Array.from({ length: 50 }, (_, index) =>
    JSON.stringify({
        cachedAt: "2026-06-01T00:00:00.000Z",
        playArea: {
            ...defaultPlayArea,
            label: `Synthetic Tokyo ${index}`,
            osmId: 20_000_000 + index,
        },
    }),
);
const syntheticManifest = syntheticBoundaryEntries.map((entry, index) => ({
    bytes: Buffer.byteLength(entry),
    osmId: 20_000_000 + index,
}));

export const boundaryScenarios: PerfScenario[] = [
    {
        fixtureHash: fixtureHash(vaticanCapture),
        group: "boundary",
        iterations: 5,
        name: "boundary/overpass-vatican-convert",
        run: () => ({ output: buildPlayAreaFromOverpass(36989, vaticanRaw) }),
        warmups: 1,
    },
    {
        fixtureHash: fixtureHash(monacoCapture),
        group: "boundary",
        iterations: 3,
        name: "boundary/overpass-monaco-convert",
        run: () => ({
            output: buildPlayAreaFromOverpass(1124039, monacoRaw),
        }),
        warmups: 1,
    },
    {
        group: "boundary",
        iterations: 20,
        name: "boundary/tokyo-mask-generic",
        run: () => ({ output: buildPlayAreaMask(defaultPlayArea.boundary) }),
        warmups: 3,
    },
    {
        group: "boundary",
        iterations: 20,
        name: "boundary/tokyo-mask-metadata",
        run: () => ({
            output: buildPlayAreaMaskFromMetadata(
                defaultPlayArea.boundary,
                defaultPlayArea.maskHoles ?? [],
            ),
        }),
        warmups: 3,
    },
    {
        group: "boundary",
        iterations: 30,
        name: "boundary/osaka-bbox",
        run: () => ({
            output: calculateBbox(
                osakaBoundary as unknown as GeoJsonFeatureCollection,
            ),
        }),
        warmups: 5,
    },
    {
        group: "boundary",
        iterations: 10,
        name: "boundary/cache-hydrate-50-eager",
        run: () => ({
            metrics: {
                parsedBytes: syntheticBoundaryEntries.reduce(
                    (sum, entry) => sum + Buffer.byteLength(entry),
                    0,
                ),
                parsedEntries: syntheticBoundaryEntries.length,
            },
            output: syntheticBoundaryEntries.map((entry) => JSON.parse(entry)),
        }),
        warmups: 2,
    },
    {
        group: "boundary",
        iterations: 30,
        name: "boundary/cache-hydrate-manifest",
        run: () => ({
            metrics: {
                parsedBytes: Buffer.byteLength(
                    JSON.stringify(syntheticManifest),
                ),
                parsedEntries: syntheticManifest.length,
            },
            output: JSON.parse(JSON.stringify(syntheticManifest)),
        }),
        warmups: 5,
    },
];
