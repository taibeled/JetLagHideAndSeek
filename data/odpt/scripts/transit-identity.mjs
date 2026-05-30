export function createGtfsRouteId(namespace, sourceId) {
    return createGtfsId(namespace, "route", sourceId);
}

export function createGtfsStopId(namespace, sourceId) {
    return createGtfsId(namespace, "stop", sourceId);
}

function createGtfsId(namespace, type, sourceId) {
    return `gtfs:${encodeSegment(namespace)}:${type}:${encodeSegment(sourceId)}`;
}

function encodeSegment(value) {
    if (!value) {
        throw new Error("Transit identity segments cannot be empty.");
    }
    return encodeURIComponent(value);
}
