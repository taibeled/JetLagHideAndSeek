import { describe, expect, it } from "vitest";

import {
    elementsToTrainLineOptions,
    extractTrainLineNodeIds,
    extractTrainLineStationLabels,
} from "./overpass";

describe("elementsToTrainLineOptions", () => {
    it("keeps exact rail way/relation choices and excludes network-only parents", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "relation",
                id: 100,
                tags: { name: "Central Line", network: "TfL" },
            },
            {
                type: "relation",
                id: 101,
                tags: { name: "Central Line", route: "subway" },
            },
            {
                type: "relation",
                id: 102,
                tags: { "name:en": "Central Line", route: "train" },
            },
            {
                type: "relation",
                id: 103,
                tags: { name: "Route Master", route_master: "train" },
            },
            {
                type: "way",
                id: 200,
                tags: { ref: "A", railway: "rail" },
            },
        ]);

        expect(options).toEqual([
            {
                id: "relation/101",
                label: "Central Line (relation/101)",
            },
            { id: "way/200", label: "A" },
        ]);
    });

    it("excludes route_master relations even when they carry route tags", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "route_master",
                id: 1,
                tags: { route: "subway", name: "Line A" },
            },
            {
                type: "relation",
                id: 3,
                tags: {
                    name: "Tagged Route Master",
                    route_master: "subway",
                    type: "route_master",
                },
            },
            {
                type: "relation",
                id: 2,
                tags: { route: "subway", name: "Line A" },
            },
        ]);

        expect(options).toEqual([
            { id: "relation/2", label: "Line A" },
        ]);
    });

    it("strips direction patterns like (Wakoshi --> Shibuya) from labels", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "relation",
                id: 1,
                tags: {
                    "name:en": "Fukutoshin Line (Wakoshi --> Shibuya)",
                    route: "subway",
                },
            },
            {
                type: "relation",
                id: 2,
                tags: {
                    "name:en": "Fukutoshin Line (Shibuya \u2192 Wakoshi)",
                    route: "subway",
                },
            },
            {
                type: "relation",
                id: 3,
                tags: { name: "Fukutoshin Line", route: "subway" },
            },
        ]);

        expect(options).toEqual([
            {
                id: "relation/1",
                label: "Fukutoshin Line (relation/1)",
            },
        ]);
    });

    it("prioritizes train lines whose ref matches the nearest station ref", () => {
        const options = elementsToTrainLineOptions(
            [
                {
                    type: "relation",
                    id: 1,
                    tags: { "name:en": "Oedo Line", ref: "E", route: "subway" },
                },
                {
                    type: "relation",
                    id: 2,
                    tags: {
                        "name:en": "Fukutoshin Line",
                        ref: "F",
                        route: "subway",
                    },
                },
            ],
            ["F"],
        );

        expect(options).toEqual([
            { id: "relation/2", label: "Fukutoshin Line" },
            { id: "relation/1", label: "Oedo Line" },
        ]);
    });

    it("keeps route relation over way when labels collide", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "way",
                id: 100,
                tags: { railway: "subway", name: "Central Line" },
            },
            {
                type: "relation",
                id: 1,
                tags: { route: "subway", name: "Central Line" },
            },
        ]);

        expect(options).toEqual([
            { id: "relation/1", label: "Central Line (relation/1)" },
        ]);
    });

    it("falls back to name when name:en is absent", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "relation",
                id: 1,
                tags: { route: "subway", name: "Local Line" },
            },
        ]);

        expect(options).toEqual([
            { id: "relation/1", label: "Local Line" },
        ]);
    });

    it("returns empty array for empty elements", () => {
        expect(elementsToTrainLineOptions([])).toEqual([]);
    });

    it("falls back to ref when name and name:en are absent", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "way",
                id: 1,
                tags: { railway: "rail", ref: "JR East" },
            },
        ]);

        expect(options).toEqual([
            { id: "way/1", label: "JR East" },
        ]);
    });

    it("falls back to OSM id when no name, name:en, or ref present", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "way",
                id: 1,
                tags: { railway: "rail" },
            },
        ]);

        expect(options).toEqual([
            { id: "way/1", label: "way/1" },
        ]);
    });

    it("accepts ways with railway tag but no route tag", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "way",
                id: 1,
                tags: { railway: "light_rail", name: "Tram" },
            },
        ]);

        expect(options).toEqual([
            { id: "way/1", label: "Tram" },
        ]);
    });

    it("excludes elements with only a network tag and no route or railway", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "relation",
                id: 1,
                tags: { network: "TfL", name: "Network" },
            },
        ]);

        expect(options).toEqual([]);
    });

    it("deduplicates by label, keeping only the first entry per cleaned label", () => {
        const options = elementsToTrainLineOptions([
            {
                type: "relation",
                id: 1,
                tags: { name: "Same Line", route: "subway" },
            },
            {
                type: "relation",
                id: 2,
                tags: { "name:en": "Same Line", route: "subway" },
            },
        ]);

        expect(options).toEqual([
            { id: "relation/1", label: "Same Line (relation/1)" },
        ]);
    });
});

describe("extractTrainLineNodeIds", () => {
    it("prefers station and stop-position nodes over track geometry nodes", () => {
        const nodes = extractTrainLineNodeIds({
            elements: [
                {
                    type: "node",
                    id: 1,
                    tags: { railway: "stop", public_transport: "stop_position" },
                },
                {
                    type: "node",
                    id: 2,
                    tags: { railway: "station", public_transport: "station" },
                },
                {
                    type: "node",
                    id: 3,
                    tags: { railway: "station", public_transport: "station" },
                },
                { type: "way", id: 10, nodes: [1, 2, 3, 4] },
            ],
        });

        expect(nodes).toEqual([1, 2, 3]);
    });

    it("extracts and dedupes node ids from Overpass nodes and way node lists", () => {
        const nodes = extractTrainLineNodeIds({
            elements: [
                { type: "node", id: 1, lat: 35, lon: 139 },
                { type: "way", id: 10, nodes: [1, 2, 3] },
                { type: "node", id: 2, lat: 35.1, lon: 139.1 },
            ],
        });

        expect(nodes).toEqual([1, 2, 3]);
    });

    it("deduplicates node ids across multiple ways with overlapping nodes", () => {
        const nodes = extractTrainLineNodeIds({
            elements: [
                { type: "node", id: 5 },
                { type: "node", id: 5 },
                { type: "way", id: 10, nodes: [5, 6, 7] },
                { type: "way", id: 11, nodes: [6, 8, 9] },
            ],
        });

        expect(nodes).toEqual([5, 6, 7, 8, 9]);
    });
});

describe("extractTrainLineStationLabels", () => {
    it("uses station nodes for the display list when stop positions are also present", () => {
        const labels = extractTrainLineStationLabels(
            {
                elements: [
                    {
                        type: "node",
                        id: 1,
                        tags: {
                            railway: "stop",
                            public_transport: "stop_position",
                            name: "Stop A",
                            ref: "F01",
                        },
                    },
                    {
                        type: "node",
                        id: 2,
                        lat: 35,
                        lon: 139,
                        tags: {
                            railway: "station",
                            public_transport: "station",
                            name: "駅A",
                            "name:en": "Station A",
                            ref: "F01",
                        },
                    },
                    {
                        type: "node",
                        id: 3,
                        lat: 35,
                        lon: 139,
                        tags: {
                            railway: "station",
                            public_transport: "station",
                            name: "駅B",
                            "name:en": "Station B",
                            ref: "F02",
                        },
                    },
                ],
            },
            "english-preferred",
        );

        expect(labels).toEqual(["Station A", "Station B"]);
    });
});
