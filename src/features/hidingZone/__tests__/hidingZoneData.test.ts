import { hidingZonePresets } from "@/features/hidingZone/hidingZoneData";
import {
    isCanonicalTransitRouteId,
    isCanonicalTransitStationId,
} from "@/features/transit/transitIdentity";

describe("generated hiding-zone preset data", () => {
    it("contains canonical source-adapter transit ids", () => {
        for (const preset of hidingZonePresets) {
            const routeIds = new Set(preset.routes.map((route) => route.id));

            expect(preset.source.kind).toBe("gtfs");
            for (const route of preset.routes) {
                expect(isCanonicalTransitRouteId(route.id)).toBe(true);
                expect(route.sourceId).not.toBe("");
            }
            for (const station of preset.stations) {
                expect(isCanonicalTransitStationId(station.id)).toBe(true);
                expect(station.mergeKey).not.toBe("");
                expect(station.sourceId).not.toBe("");
                expect(
                    station.routeIds.every(
                        (routeId) =>
                            isCanonicalTransitRouteId(routeId) &&
                            routeIds.has(routeId),
                    ),
                ).toBe(true);
            }
        }
    });
});
