export type PlayAreaModeId = "default" | "japan";

export interface MatchingZoneLevel {
    adminLevel: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
    label: string;
}

export interface PlayAreaModeConfig {
    id: PlayAreaModeId;
    label: string;
    matchingZoneLevels: MatchingZoneLevel[];
    defaultMatchingAdminLevel: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
    stationNameStrategy: "english-preferred" | "native-preferred";
    highSpeedRailLabel: string;
}

export const PLAY_AREA_MODES: Record<PlayAreaModeId, PlayAreaModeConfig> = {
    default: {
        id: "default",
        label: "Default",
        matchingZoneLevels: [
            { adminLevel: 2, label: "OSM Zone 2 (Country)" },
            { adminLevel: 3, label: "OSM Zone 3" },
            { adminLevel: 4, label: "OSM Zone 4" },
            { adminLevel: 5, label: "OSM Zone 5" },
            { adminLevel: 6, label: "OSM Zone 6" },
            { adminLevel: 7, label: "OSM Zone 7" },
            { adminLevel: 8, label: "OSM Zone 8" },
            { adminLevel: 9, label: "OSM Zone 9" },
            { adminLevel: 10, label: "OSM Zone 10" },
        ],
        defaultMatchingAdminLevel: 3,
        stationNameStrategy: "english-preferred",
        highSpeedRailLabel: "High-speed rail",
    },
    japan: {
        id: "japan",
        label: "Japan",
        matchingZoneLevels: [
            { adminLevel: 4, label: "Prefecture" },
            { adminLevel: 7, label: "City / Ku" },
            { adminLevel: 9, label: "Cho" },
            { adminLevel: 10, label: "Cho-me" },
        ],
        defaultMatchingAdminLevel: 4,
        stationNameStrategy: "native-preferred",
        highSpeedRailLabel: "Shinkansen",
    },
};
