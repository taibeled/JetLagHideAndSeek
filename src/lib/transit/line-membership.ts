import {
    getAllRoutes,
    getAllStops,
    getAllStopTimes,
    getAllTrips,
    listSystems,
} from "./gtfs-store";
import { stationNameMatchKey } from "./osm-gtfs-match";
import type { TransitRoute } from "./types";

const lineMembershipCache = new Map<string, Promise<Set<string>>>();

const normalizeLineRef = (value: string) =>
    value.trim().replace(/^<+/, "").replace(/>+$/, "").toUpperCase();

const lineRefMatchesTokenString = (
    normalizedRef: string,
    routeRefRaw?: string,
) => {
    const routeRef = normalizeLineRef(routeRefRaw ?? "");
    if (!routeRef) return false;
    if (routeRef === normalizedRef) return true;
    const tokens = routeRef
        .split(/[;,/ ]+/)
        .map((x) => normalizeLineRef(x))
        .filter(Boolean);
    return tokens.includes(normalizedRef);
};

const lineRefMatchesTransitRoute = (
    normalizedRef: string,
    route: Pick<TransitRoute, "shortName" | "longName" | "gtfsRouteId">,
) =>
    lineRefMatchesTokenString(normalizedRef, route.shortName) ||
    lineRefMatchesTokenString(normalizedRef, route.longName) ||
    lineRefMatchesTokenString(normalizedRef, route.gtfsRouteId);

/** Feeds that look like a subway system (NYCT and friends). */
const isSubwayFeed = (s: { id: string; name: string }) => {
    const id = s.id.toLowerCase();
    const name = s.name.toLowerCase();
    return (
        id.includes("subway") || name.includes("subway") || id.includes("nyct")
    );
};

export async function getGtfsStationNamesForLineRef(
    lineRefRaw: string,
): Promise<Set<string>> {
    const normalizedRef = normalizeLineRef(lineRefRaw);
    if (!normalizedRef) return new Set();

    const existing = lineMembershipCache.get(normalizedRef);
    if (existing) return existing;

    const pending = (async () => {
        const systems = await listSystems();
        let systemIds = systems.filter(isSubwayFeed).map((s) => s.id);
        if (systemIds.length === 0) {
            systemIds = systems.map((s) => s.id);
        }

        const [routes, trips, stopTimes, stops] = await Promise.all([
            getAllRoutes(systemIds.length > 0 ? systemIds : undefined),
            getAllTrips(systemIds.length > 0 ? systemIds : undefined),
            getAllStopTimes(systemIds.length > 0 ? systemIds : undefined),
            getAllStops(systemIds.length > 0 ? systemIds : undefined),
        ]);

        const routeIds = new Set(
            routes
                .filter(
                    (route) =>
                        route.routeType === 1 &&
                        lineRefMatchesTransitRoute(normalizedRef, route),
                )
                .map((route) => route.id),
        );
        if (routeIds.size === 0) return new Set<string>();

        const tripIds = new Set(
            trips
                .filter((trip) => routeIds.has(trip.routeId))
                .map((trip) => trip.id),
        );
        if (tripIds.size === 0) return new Set<string>();

        const stopIds = new Set<string>();
        for (const tripStopTime of stopTimes) {
            if (!tripIds.has(tripStopTime.tripId)) continue;
            for (const stopId of tripStopTime.stopIds) stopIds.add(stopId);
        }
        if (stopIds.size === 0) return new Set<string>();

        const stopById = new Map(stops.map((stop) => [stop.id, stop]));
        const stationNames = new Set<string>();
        for (const stopId of stopIds) {
            const stop = stopById.get(stopId);
            if (!stop) continue;
            const n = stationNameMatchKey(stop.name);
            if (n) stationNames.add(n);
            if (stop.parentStopId) {
                const parent = stopById.get(stop.parentStopId);
                if (parent) {
                    const pn = stationNameMatchKey(parent.name);
                    if (pn) stationNames.add(pn);
                }
            }
        }

        return stationNames;
    })();

    lineMembershipCache.set(normalizedRef, pending);
    return pending;
}

/**
 * When Overpass returns no route refs (timeouts, sparse tagging), still offer
 * chips from imported GTFS subway routes (e.g. NYCT) so players can pick "7".
 */
export async function getSubwayLineRefOptionsFromGtfs(): Promise<string[]> {
    const systems = await listSystems();
    if (systems.length === 0) return [];

    let systemIds = systems.filter(isSubwayFeed).map((s) => s.id);
    if (systemIds.length === 0) {
        systemIds = systems.map((s) => s.id);
    }

    const routes = await getAllRoutes(systemIds);
    const refs = new Set<string>();
    const addChip = (raw?: string) => {
        const t = normalizeLineRef(String(raw ?? ""));
        if (!t || t.length > 8) return;
        refs.add(t);
    };

    for (const route of routes) {
        if (route.routeType !== 1) continue;
        addChip(route.shortName);
        addChip(route.gtfsRouteId);
    }

    return [...refs].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
    );
}
