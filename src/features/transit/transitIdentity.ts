export type OsmElementType = "node" | "relation" | "way";

const ENCODED_SEGMENT = "[^:]+";
const GTFS_ROUTE_ID = new RegExp(
    `^gtfs:${ENCODED_SEGMENT}:route:${ENCODED_SEGMENT}$`,
);
const GTFS_STOP_ID = new RegExp(
    `^gtfs:${ENCODED_SEGMENT}:stop:${ENCODED_SEGMENT}$`,
);
const OSM_ELEMENT_ID = /^(?:osm):(node|relation|way):([1-9]\d*)$/;

export function createGtfsRouteId(namespace: string, sourceId: string): string {
    return createGtfsId(namespace, "route", sourceId);
}

export function createGtfsStopId(namespace: string, sourceId: string): string {
    return createGtfsId(namespace, "stop", sourceId);
}

export function createOsmElementId(
    type: OsmElementType,
    sourceId: string | number,
): string {
    const id = String(sourceId);
    if (!/^[1-9]\d*$/.test(id)) {
        throw new Error("OSM element ids must be positive integers.");
    }
    return `osm:${type}:${id}`;
}

export function isCanonicalTransitRouteId(value: string): boolean {
    return GTFS_ROUTE_ID.test(value) || /^osm:relation:[1-9]\d*$/.test(value);
}

export function isCanonicalTransitStationId(value: string): boolean {
    return GTFS_STOP_ID.test(value) || OSM_ELEMENT_ID.test(value);
}

function createGtfsId(
    namespace: string,
    type: "route" | "stop",
    sourceId: string,
): string {
    return `gtfs:${encodeSegment(namespace)}:${type}:${encodeSegment(sourceId)}`;
}

function encodeSegment(value: string): string {
    if (!value) {
        throw new Error("Transit identity segments cannot be empty.");
    }
    return encodeURIComponent(value);
}
