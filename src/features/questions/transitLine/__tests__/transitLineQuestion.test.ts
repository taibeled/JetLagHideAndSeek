import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import { getTransitLineOptions } from "@/features/questions/transitLine/transitLineQuestion";

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
});
