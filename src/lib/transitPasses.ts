import type { OpenStreetMap } from "@/maps/api";

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
} from "./context";

export interface TransitPassProfile {
    id: string;
    label: string;
    description: string;
    zoneOptions: string[];
    operators: string[];
    displayStyle: "zones" | "stations" | "no-overlap" | "no-display";
    radius: number;
    radiusUnits: "miles" | "kilometers" | "meters";
}

export const DEFAULT_STATION_ZONE_OPTIONS = ["[railway=station]"] as const;

export const TOKYO_METRO_DAYPASS_ZONE_OPTIONS = [
    "[railway=station]",
    "[railway=stop]",
] as const;

export const TOKYO_METRO_DAYPASS_OPERATORS = [
    "東京地下鉄",
    "東京地下鉄;東京都交通局",
    "西武鉄道;東京地下鉄",
    "東日本旅客鉄道;東京地下鉄",
    "東急電鉄;東京地下鉄",
    "東京地下鉄;埼玉高速鉄道",
    "東京メトロ半蔵門線",
    "東京メト",
    "東京急行電鉄;東京地下鉄",
    "小田急電鉄;東京地下鉄",
    "東武鉄道;東京地下鉄",
    "東京メトロ",
] as const;

export const TOKYO_METRO_DAYPASS_PROFILE: TransitPassProfile = {
    id: "tokyo-metro-daypass",
    label: "Tokyo Metro Daypass",
    description: "Add Tokyo Metro daypass station and operator coverage",
    zoneOptions: [...TOKYO_METRO_DAYPASS_ZONE_OPTIONS],
    operators: [...TOKYO_METRO_DAYPASS_OPERATORS],
    displayStyle: "no-overlap",
    radius: 600,
    radiusUnits: "meters",
};

export const TRANSIT_PASS_PROFILES = [
    TOKYO_METRO_DAYPASS_PROFILE,
] as const satisfies readonly TransitPassProfile[];

const TOKYO_TRANSIT_PASS_LOCATION_NAMES = new Set([
    "Tokyo",
    "Tokyo 23 Wards",
    "東京都",
    "東京23区",
]);

const TOKYO_TRANSIT_PASS_OSM_IDS = new Set([
    1543125, // Tokyo prefecture
    19631009, // Tokyo 23 wards
]);

const unionStrings = (current: string[], additions: string[]) => [
    ...new Set([...current, ...additions]),
];

export const isTokyoTransitPassEligibleLocation = (
    location: OpenStreetMap | null | undefined,
) => {
    const properties = location?.properties;
    if (!properties || properties.countrycode !== "JP") return false;

    return (
        TOKYO_TRANSIT_PASS_OSM_IDS.has(properties.osm_id) ||
        TOKYO_TRANSIT_PASS_LOCATION_NAMES.has(properties.name)
    );
};

export const isTransitPassProfileApplied = (
    profile: TransitPassProfile,
    selectedOperators: string[],
) =>
    profile.operators.every((operator) => selectedOperators.includes(operator));

export const applyTransitPassProfile = (profile: TransitPassProfile) => {
    displayHidingZones.set(true);
    displayHidingZonesOptions.set(
        unionStrings(displayHidingZonesOptions.get(), profile.zoneOptions),
    );
    displayHidingZoneOperators.set(
        unionStrings(displayHidingZoneOperators.get(), profile.operators),
    );
    displayHidingZonesStyle.set(profile.displayStyle);
    hidingRadius.set(profile.radius);
    hidingRadiusUnits.set(profile.radiusUnits);
    useCustomStations.set(false);
    includeDefaultStations.set(false);
    mergeDuplicates.set(false);
    disabledStations.set([]);
};

export const resetStationSettings = () => {
    displayHidingZones.set(false);
    displayHidingZonesOptions.set([...DEFAULT_STATION_ZONE_OPTIONS]);
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
