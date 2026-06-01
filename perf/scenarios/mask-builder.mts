import {
    buildCombinedEligibilityMask,
    clearMaskResultCache,
} from "../../src/features/map/maskBuilder.ts";
import type { GeoJsonFeatureCollection } from "../../src/features/map/geojsonTypes.ts";
import type { PerfScenario } from "../lib.mts";

const playArea = polygon(0, 0, 100, 100);
const requiredInside = polygon(10, 10, 90, 90);
const requiredDisjoint = polygon(110, 110, 120, 120);
const excludedInside = polygon(40, 40, 60, 60);
const excludedDisjoint = polygon(110, 10, 120, 20);
const excludedTouching = polygon(100, 10, 110, 20);
const excludedEdited = polygon(42, 42, 62, 62);

export const maskBuilderScenarios: PerfScenario[] = [
    maskScenario("mask-builder/required-disjoint", [requiredDisjoint], []),
    maskScenario(
        "mask-builder/excluded-disjoint",
        [requiredInside],
        [excludedDisjoint],
    ),
    maskScenario(
        "mask-builder/excluded-touching",
        [requiredInside],
        [excludedTouching],
    ),
    maskScenario(
        "mask-builder/excluded-overlap",
        [requiredInside],
        [excludedInside],
    ),
    {
        group: "mask-builder",
        iterations: 30,
        name: "mask-builder/excluded-overlap-warm-exact",
        setup: () => {
            clearMaskResultCache();
            buildCombinedEligibilityMask(
                playArea,
                [requiredInside],
                [excludedInside],
            );
        },
        run: () => ({
            output: buildCombinedEligibilityMask(
                playArea,
                [requiredInside],
                [excludedInside],
            ),
        }),
        warmups: 5,
    },
    {
        group: "mask-builder",
        iterations: 20,
        name: "mask-builder/one-exclusion-edit",
        setup: () => {
            clearMaskResultCache();
            buildCombinedEligibilityMask(
                playArea,
                [requiredInside],
                [excludedInside],
            );
        },
        run: () => ({
            metrics: { editedFragments: 1 },
            output: buildCombinedEligibilityMask(
                playArea,
                [requiredInside],
                [excludedEdited],
            ),
        }),
        warmups: 3,
    },
];

function maskScenario(
    name: string,
    required: GeoJsonFeatureCollection[],
    excluded: GeoJsonFeatureCollection[],
): PerfScenario {
    return {
        group: "mask-builder",
        iterations: 20,
        name,
        run: () => ({
            output: buildCombinedEligibilityMask(playArea, required, excluded),
        }),
        setup: clearMaskResultCache,
        warmups: 3,
    };
}

function polygon(
    west: number,
    south: number,
    east: number,
    north: number,
): GeoJsonFeatureCollection {
    return {
        features: [
            {
                geometry: {
                    coordinates: [
                        [
                            [west, south],
                            [east, south],
                            [east, north],
                            [west, north],
                            [west, south],
                        ],
                    ],
                    type: "Polygon",
                },
                properties: {},
                type: "Feature",
            },
        ],
        type: "FeatureCollection",
    };
}
