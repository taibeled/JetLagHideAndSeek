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
} from "@/features/questions/transitLine/transitLineQuestion";

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
                    id: "3",
                    name: "Hibiya Line",
                },
            ],
            stations: [
                {
                    id: "302:139.70870,35.64704",
                    lat: 35.64704,
                    lon: 139.708701,
                    name: "Ebisu",
                    routeIds: ["3"],
                },
                {
                    id: "303:139.72221,35.65150",
                    lat: 35.651499,
                    lon: 139.722209,
                    name: "Hiroo",
                    routeIds: ["3"],
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
                    id: "3",
                    name: "Shinjuku Line",
                },
            ],
            stations: [
                {
                    id: "301:139.69842,35.68843",
                    lat: 35.688433,
                    lon: 139.698418,
                    name: "Shinjuku",
                    routeIds: ["3"],
                },
                {
                    id: "302:139.70679,35.69102",
                    lat: 35.691016,
                    lon: 139.706794,
                    name: "Shinjuku-sanchome",
                    routeIds: ["3"],
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
            id: "tokyo-metro:3",
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
