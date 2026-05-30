import assert from "node:assert/strict";
import test from "node:test";

import { processGtfsTables } from "./fetch-odpt.mjs";

const tables = {
    routes: [
        {
            route_color: "B5B5AC",
            route_id: "3",
            route_long_name: "Line 3",
        },
    ],
    shapes: [],
    stops: [
        {
            stop_id: "303",
            stop_lat: "35.651499",
            stop_lon: "139.722209",
            stop_name: "Station 303",
        },
        {
            stop_id: "304",
            stop_lat: "35.662800",
            stop_lon: "139.731155",
            stop_name: "Station 304",
        },
    ],
    stopTimes: [
        { stop_id: "303", stop_sequence: "1", trip_id: "trip-1" },
        { stop_id: "304", stop_sequence: "2", trip_id: "trip-1" },
    ],
    trips: [{ route_id: "3", trip_id: "trip-1" }],
};

function makeSource(namespace) {
    return {
        defaultColor: "#009BBF",
        id: namespace,
        label: namespace,
        namespace,
        operator: namespace,
    };
}

test("processGtfsTables namespaces colliding feed-local route ids", () => {
    const metro = processGtfsTables(makeSource("odpt-tokyo-metro"), tables);
    const toei = processGtfsTables(makeSource("odpt-toei-subway"), tables);

    assert.equal(metro.routes[0].id, "gtfs:odpt-tokyo-metro:route:3");
    assert.equal(toei.routes[0].id, "gtfs:odpt-toei-subway:route:3");
    assert.notEqual(metro.routes[0].id, toei.routes[0].id);
    assert.equal(metro.routes[0].sourceId, "3");
    assert.deepEqual(metro.stations[0], {
        id: "gtfs:odpt-tokyo-metro:stop:303",
        lat: 35.651499,
        lon: 139.722209,
        mergeKey: "303:139.72221,35.65150",
        name: "Station 303",
        routeIds: ["gtfs:odpt-tokyo-metro:route:3"],
        sourceId: "303",
    });
});
