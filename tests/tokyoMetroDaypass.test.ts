import { afterEach, describe, expect, it } from "vitest";

import {
    customStations,
    disabledStations,
    displayHidingZoneOperators,
    displayHidingZones,
    displayHidingZonesOptions,
    displayHidingZonesStyle,
    hidingRadius,
    hidingRadiusUnits,
    includeDefaultStations,
    mergeDuplicates,
    useCustomStations,
} from "@/lib/context";
import {
    applyTransitPassProfile,
    isTokyoTransitPassEligibleLocation,
    resetStationSettings,
    TOKYO_METRO_DAYPASS_OPERATORS,
    TOKYO_METRO_DAYPASS_PROFILE,
    TOKYO_METRO_DAYPASS_ZONE_OPTIONS,
    type TransitPassProfile,
} from "@/lib/transitPasses";
import type { OpenStreetMap } from "@/maps/api";

const location = (name: string, osmId: number): OpenStreetMap => ({
    type: "Feature",
    geometry: {
        type: "Point",
        coordinates: [35.6494917, 139.7386564],
    },
    properties: {
        osm_type: "R",
        osm_id: osmId,
        osm_key: "boundary",
        countrycode: "JP",
        osm_value: "administrative",
        name,
        type: "administrative",
    },
});

const resetAtoms = () => {
    displayHidingZones.set(false);
    displayHidingZonesOptions.set(["[railway=station]"]);
    displayHidingZoneOperators.set([]);
    displayHidingZonesStyle.set("zones");
    hidingRadius.set(0.5);
    hidingRadiusUnits.set("miles");
    useCustomStations.set(false);
    customStations.set([]);
    disabledStations.set([]);
    includeDefaultStations.set(false);
    mergeDuplicates.set(false);
};

afterEach(resetAtoms);

describe("transit pass profiles", () => {
    it("is available for Tokyo prefecture and Tokyo 23 wards", () => {
        expect(
            isTokyoTransitPassEligibleLocation(location("Tokyo", 1543125)),
        ).toBe(true);
        expect(
            isTokyoTransitPassEligibleLocation(
                location("Tokyo 23 Wards", 19631009),
            ),
        ).toBe(true);
        expect(
            isTokyoTransitPassEligibleLocation(location("Osaka", 1543126)),
        ).toBe(false);
    });

    it("adds the Tokyo Metro Daypass settings without deleting imported stations", () => {
        useCustomStations.set(true);
        customStations.set([{ id: "custom", name: "Custom", lat: 1, lng: 2 }]);
        disabledStations.set(["node/1"]);
        includeDefaultStations.set(true);
        mergeDuplicates.set(true);

        applyTransitPassProfile(TOKYO_METRO_DAYPASS_PROFILE);

        expect(displayHidingZones.get()).toBe(true);
        expect(displayHidingZonesOptions.get()).toEqual([
            ...TOKYO_METRO_DAYPASS_ZONE_OPTIONS,
        ]);
        expect(displayHidingZoneOperators.get()).toEqual([
            ...TOKYO_METRO_DAYPASS_OPERATORS,
        ]);
        expect(displayHidingZonesStyle.get()).toBe("no-overlap");
        expect(hidingRadius.get()).toBe(600);
        expect(hidingRadiusUnits.get()).toBe("meters");
        expect(useCustomStations.get()).toBe(false);
        expect(customStations.get()).toEqual([
            { id: "custom", name: "Custom", lat: 1, lng: 2 },
        ]);
        expect(disabledStations.get()).toEqual([]);
        expect(includeDefaultStations.get()).toBe(false);
        expect(mergeDuplicates.get()).toBe(false);
    });

    it("is idempotent and preserves manual selections", () => {
        displayHidingZonesOptions.set(["[railway=halt]"]);
        displayHidingZoneOperators.set(["Manual Operator"]);

        applyTransitPassProfile(TOKYO_METRO_DAYPASS_PROFILE);
        applyTransitPassProfile(TOKYO_METRO_DAYPASS_PROFILE);

        expect(displayHidingZonesOptions.get()).toEqual([
            "[railway=halt]",
            ...TOKYO_METRO_DAYPASS_ZONE_OPTIONS,
        ]);
        expect(displayHidingZoneOperators.get()).toEqual([
            "Manual Operator",
            ...TOKYO_METRO_DAYPASS_OPERATORS,
        ]);
    });

    it("unions multiple pass profiles", () => {
        const passA: TransitPassProfile = {
            id: "a",
            label: "A",
            description: "A",
            zoneOptions: ["[railway=station]", "[railway=halt]"],
            operators: ["A Rail", "Shared Rail"],
            displayStyle: "no-overlap",
            radius: 600,
            radiusUnits: "meters",
        };
        const passB: TransitPassProfile = {
            id: "b",
            label: "B",
            description: "B",
            zoneOptions: ["[railway=station]", "[railway=stop]"],
            operators: ["Shared Rail", "B Rail"],
            displayStyle: "no-overlap",
            radius: 600,
            radiusUnits: "meters",
        };

        applyTransitPassProfile(passA);
        applyTransitPassProfile(passB);

        expect(displayHidingZonesOptions.get()).toEqual([
            "[railway=station]",
            "[railway=halt]",
            "[railway=stop]",
        ]);
        expect(displayHidingZoneOperators.get()).toEqual([
            "A Rail",
            "Shared Rail",
            "B Rail",
        ]);
    });

    it("resets station settings explicitly", () => {
        displayHidingZones.set(true);
        displayHidingZonesOptions.set(["[railway=stop]"]);
        displayHidingZoneOperators.set(["Tokyo Metro"]);
        displayHidingZonesStyle.set("no-overlap");
        hidingRadius.set(600);
        hidingRadiusUnits.set("meters");
        useCustomStations.set(true);
        customStations.set([{ id: "custom", name: "Custom", lat: 1, lng: 2 }]);
        disabledStations.set(["node/1"]);
        includeDefaultStations.set(true);
        mergeDuplicates.set(true);

        resetStationSettings();

        expect(displayHidingZones.get()).toBe(false);
        expect(displayHidingZonesOptions.get()).toEqual(["[railway=station]"]);
        expect(displayHidingZoneOperators.get()).toEqual([]);
        expect(displayHidingZonesStyle.get()).toBe("zones");
        expect(hidingRadius.get()).toBe(0.5);
        expect(hidingRadiusUnits.get()).toBe("miles");
        expect(useCustomStations.get()).toBe(false);
        expect(customStations.get()).toEqual([]);
        expect(disabledStations.get()).toEqual([]);
        expect(includeDefaultStations.get()).toBe(false);
        expect(mergeDuplicates.get()).toBe(false);
    });
});
