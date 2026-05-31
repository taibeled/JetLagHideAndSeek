import {
    getSelectedRoutes,
    getSelectedStations,
} from "@/features/hidingZone/hidingZone";
import type {
    HidingZonePreset,
    TransitStation,
} from "@/features/hidingZone/hidingZoneTypes";
import {
    buildTransitLineMaskFeatures,
    getTransitLineOptions,
    reconcileTransitLineQuestionSelection,
} from "@/features/questions/transitLine/transitLineQuestion";
import type { TransitLineQuestion } from "@/features/questions/transitLine/transitLineTypes";

const stations: TransitStation[] = [
    {
        id: "near-a",
        lat: 35.0002,
        lon: 139,
        name: "Near A",
        routeIds: ["a"],
    },
    {
        id: "far-a",
        lat: 35.1,
        lon: 139,
        name: "Far A",
        routeIds: ["a"],
    },
    {
        id: "near-b",
        lat: 35.001,
        lon: 139,
        name: "Near B",
        routeIds: ["b"],
    },
    {
        id: "tie-c",
        lat: 35.001,
        lon: 139,
        name: "Tie C",
        routeIds: ["c"],
    },
    {
        id: "too-far-d",
        lat: 35.01,
        lon: 139,
        name: "Too Far D",
        routeIds: ["d"],
    },
];

function collectLats(geometry: any): number[] {
    if (geometry.type === "Polygon") {
        return geometry.coordinates
            .flat()
            .map((coordinate: number[]) => coordinate[1]);
    }
    if (geometry.type === "MultiPolygon") {
        return geometry.coordinates
            .flat(2)
            .map((coordinate: number[]) => coordinate[1]);
    }
    return [];
}

describe("getTransitLineOptions", () => {
    it("sorts lines by closest station distance", () => {
        const options = getTransitLineOptions(
            stations,
            new Map([
                ["a", "A Line"],
                ["b", "B Line"],
                ["c", "C Line"],
                ["d", "D Line"],
            ]),
            [139, 35],
            600,
        );

        expect(options.map((option) => option.id)).toEqual(["a", "b", "c"]);
        expect(options[0].closestStation?.station.name).toBe("Near A");
        expect(options[0].stationCount).toBe(2);
        expect(options[0].distanceMeters).toBeLessThan(
            options[1].distanceMeters ?? Number.POSITIVE_INFINITY,
        );
    });

    it("tie-breaks equal distances by line name", () => {
        const options = getTransitLineOptions(
            stations.filter((station) =>
                ["near-b", "tie-c"].includes(station.id),
            ),
            new Map([
                ["b", "B Line"],
                ["c", "C Line"],
            ]),
            [139, 35],
            600,
        );

        expect(options.map((option) => option.id)).toEqual(["b", "c"]);
    });

    it("filters out lines whose closest station is beyond the radius", () => {
        const options = getTransitLineOptions(
            stations,
            new Map([
                ["a", "A Line"],
                ["b", "B Line"],
                ["c", "C Line"],
                ["d", "D Line"],
            ]),
            [139, 35],
            600,
        );

        expect(options.map((option) => option.id)).not.toContain("d");
    });

    it("returns no options when there are no selected stations", () => {
        expect(getTransitLineOptions([], new Map(), [139, 35], 600)).toEqual(
            [],
        );
    });

    it("keeps colliding operator-local route ids separate", () => {
        const tokyoMetro: HidingZonePreset = {
            bbox: [139.6, 35.6, 139.8, 35.8],
            defaultColor: "#B5B5AC",
            id: "tokyo-metro",
            label: "Tokyo Metro",
            operator: "TokyoMetro",
            routes: [
                {
                    color: "#B5B5AC",
                    geometry: {
                        coordinates: [
                            [
                                [139.708701, 35.64704],
                                [139.722209, 35.651499],
                            ],
                        ],
                        type: "MultiLineString",
                    },
                    id: "gtfs:odpt-tokyo-metro:route:3",
                    name: "Hibiya Line",
                    sourceId: "3",
                },
            ],
            source: { kind: "gtfs", namespace: "odpt-tokyo-metro" },
            stations: [
                {
                    id: "gtfs:odpt-tokyo-metro:stop:302",
                    lat: 35.64704,
                    lon: 139.708701,
                    mergeKey: "302:139.70870,35.64704",
                    name: "Ebisu",
                    routeIds: ["gtfs:odpt-tokyo-metro:route:3"],
                    sourceId: "302",
                },
                {
                    id: "gtfs:odpt-tokyo-metro:stop:303",
                    lat: 35.651499,
                    lon: 139.722209,
                    mergeKey: "303:139.72221,35.65150",
                    name: "Hiroo",
                    routeIds: ["gtfs:odpt-tokyo-metro:route:3"],
                    sourceId: "303",
                },
            ],
        };
        const toeiSubway: HidingZonePreset = {
            bbox: [139.65, 35.65, 139.93, 35.75],
            defaultColor: "#6CBB5A",
            id: "toei-subway",
            label: "Toei Subway",
            operator: "Toei",
            routes: [
                {
                    color: "#6CBB5A",
                    geometry: {
                        coordinates: [
                            [
                                [139.698418, 35.688433],
                                [139.706794, 35.691016],
                            ],
                        ],
                        type: "MultiLineString",
                    },
                    id: "gtfs:odpt-toei-subway:route:3",
                    name: "Shinjuku Line",
                    sourceId: "3",
                },
            ],
            source: { kind: "gtfs", namespace: "odpt-toei-subway" },
            stations: [
                {
                    id: "gtfs:odpt-toei-subway:stop:301",
                    lat: 35.688433,
                    lon: 139.698418,
                    mergeKey: "301:139.69842,35.68843",
                    name: "Shinjuku",
                    routeIds: ["gtfs:odpt-toei-subway:route:3"],
                    sourceId: "301",
                },
                {
                    id: "gtfs:odpt-toei-subway:stop:302",
                    lat: 35.691016,
                    lon: 139.706794,
                    mergeKey: "302:139.70679,35.69102",
                    name: "Shinjuku-sanchome",
                    routeIds: ["gtfs:odpt-toei-subway:route:3"],
                    sourceId: "302",
                },
            ],
        };
        const selectedRoutes = getSelectedRoutes([tokyoMetro, toeiSubway]);
        const routeNames = new Map(
            selectedRoutes.map((route) => [route.id, route.name]),
        );

        const options = getTransitLineOptions(
            getSelectedStations([tokyoMetro, toeiSubway]),
            routeNames,
            [139.72134, 35.65125],
            600,
        );

        expect(options).toHaveLength(1);
        expect(options[0]).toMatchObject({
            closestStation: {
                station: expect.objectContaining({ name: "Hiroo" }),
            },
            id: "gtfs:odpt-tokyo-metro:route:3",
            name: "Hibiya Line",
            stationCount: 2,
        });

        const hibiyaMask = buildTransitLineMaskFeatures(
            getSelectedStations([tokyoMetro, toeiSubway]),
            options[0].id,
            600,
        );
        const maskLatitudes = hibiyaMask.features.flatMap((feature) =>
            collectLats(feature.geometry),
        );

        expect(Math.max(...maskLatitudes)).toBeLessThan(35.66);
    });
});

describe("reconcileTransitLineQuestionSelection", () => {
    const option = {
        closestStation: {
            distanceMeters: 33,
            station: stations[0],
        },
        distanceMeters: 33,
        id: "gtfs:odpt-tokyo-metro:route:3",
        name: "Hibiya Line",
        stationCount: 22,
    };
    const question: TransitLineQuestion = {
        answer: "unanswered",
        candidates: [],
        category: "transit-line",
        center: [139.72214, 35.65121],
        createdAt: "2026-05-30T00:00:00.000Z",
        id: "matching-1",
        lineId: null,
        lineName: null,
        selectedOsmId: null,
        selectedOsmType: null,
        targetName: null,
        targetOsmId: null,
        targetOsmType: null,
        type: "matching",
        updatedAt: "2026-05-30T00:00:00.000Z",
    };

    it("auto-selects a sole nearby line", () => {
        expect(
            reconcileTransitLineQuestionSelection(
                question,
                [option],
                "2026-05-30T01:00:00.000Z",
            ),
        ).toEqual({
            ...question,
            lineId: option.id,
            lineName: option.name,
            updatedAt: "2026-05-30T01:00:00.000Z",
        });
    });

    it("clears stale selections and answers when the pin has no unique line", () => {
        expect(
            reconcileTransitLineQuestionSelection(
                {
                    ...question,
                    answer: "positive",
                    lineId: option.id,
                    lineName: option.name,
                },
                [],
                "2026-05-30T01:00:00.000Z",
            ),
        ).toEqual({
            ...question,
            updatedAt: "2026-05-30T01:00:00.000Z",
        });
    });
});
