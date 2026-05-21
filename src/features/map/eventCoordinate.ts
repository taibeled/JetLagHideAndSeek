export function getEventCoordinate(event: unknown): [number, number] | null {
    if (!isRecord(event)) return null;

    const nativeEvent = event.nativeEvent;
    if (isRecord(nativeEvent)) {
        const nativeCoordinate = getEventCoordinate(nativeEvent);
        if (nativeCoordinate) return nativeCoordinate;
    }

    const payload = event.payload;
    if (isRecord(payload)) {
        const payloadCoordinate = getEventCoordinate(payload);
        if (payloadCoordinate) return payloadCoordinate;
    }

    const directCoordinates = event.coordinates;
    if (
        isRecord(directCoordinates) &&
        typeof directCoordinates.longitude === "number" &&
        typeof directCoordinates.latitude === "number"
    ) {
        return [directCoordinates.longitude, directCoordinates.latitude];
    }
    if (Array.isArray(directCoordinates)) {
        const coordinate = getCoordinateFromArray(directCoordinates);
        if (coordinate) return coordinate;
    }

    const geometry = event.geometry;
    if (isRecord(geometry) && Array.isArray(geometry.coordinates)) {
        const coordinate = getCoordinateFromArray(geometry.coordinates);
        if (coordinate) return coordinate;
    }

    return null;
}

export function getCoordinateFromArray(
    value: unknown[],
): [number, number] | null {
    const [lon, lat] = value;
    if (
        typeof lon === "number" &&
        typeof lat === "number" &&
        Number.isFinite(lon) &&
        Number.isFinite(lat) &&
        Math.abs(lon) <= 180 &&
        Math.abs(lat) <= 90
    ) {
        return [lon, lat];
    }
    return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
