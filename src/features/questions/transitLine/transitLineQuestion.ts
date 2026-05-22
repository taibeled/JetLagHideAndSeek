import { buildHidingZoneFeatureCollection } from "@/features/hidingZone/hidingZone";
import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import type { TransitLineQuestionFeatureCollection } from "@/features/questions/transitLine/transitLineTypes";

export function getTransitLineOptions(
    stations: TransitStation[],
    routeNamesById: Map<string, string>,
): Array<{ id: string; name: string; stationCount: number }> {
    const countById = new Map<string, number>();
    stations.forEach((station) => {
        station.routeIds.forEach((routeId) => {
            countById.set(routeId, (countById.get(routeId) ?? 0) + 1);
        });
    });

    return [...countById.entries()]
        .map(([id, stationCount]) => ({
            id,
            name: routeNamesById.get(id) ?? id,
            stationCount,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildTransitLineMaskFeatures(
    stations: TransitStation[],
    lineId: string | null,
    radiusMeters: number,
): TransitLineQuestionFeatureCollection {
    if (!lineId) return { type: "FeatureCollection", features: [] };

    const lineStations = stations.filter((station) =>
        station.routeIds.includes(lineId),
    );

    return buildHidingZoneFeatureCollection(
        lineStations,
        radiusMeters,
    ) as unknown as TransitLineQuestionFeatureCollection;
}
