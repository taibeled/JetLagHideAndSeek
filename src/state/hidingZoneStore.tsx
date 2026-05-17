import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

import { hidingZonePresets } from "@/features/hidingZone/hidingZoneData";
import {
    buildHidingZoneFeatureCollection,
    buildRouteFeatureCollection,
    buildStationFeatureCollection,
    fromMeters,
    getSelectedPresets,
    getSelectedRoutes,
    getSelectedStations,
    getSuggestedPresetIds,
    toMeters,
} from "@/features/hidingZone/hidingZone";
import type {
    HidingZonePreset,
    HidingZoneUnit,
    RouteFeatureCollection,
    StationFeatureCollection,
    TransitRoute,
    TransitStation,
    ZoneFeatureCollection,
} from "@/features/hidingZone/hidingZoneTypes";
import { usePlayArea } from "@/state/playAreaStore";

const DEFAULT_RADIUS_METERS = 600;

export type HidingZoneImportState = {
    radiusMeters: number;
    radiusUnit: HidingZoneUnit;
    selectedPresetIds: string[];
};

type HidingZoneState = {
    addPreset: (presetId: string) => void;
    presets: HidingZonePreset[];
    radiusDisplayValue: string;
    radiusMeters: number;
    radiusUnit: HidingZoneUnit;
    removePreset: (presetId: string) => void;
    replaceSetup: (nextSetup: HidingZoneImportState) => void;
    routeFeatures: RouteFeatureCollection;
    selectedPresetIds: string[];
    selectedPresets: HidingZonePreset[];
    selectedRoutes: TransitRoute[];
    selectedStations: TransitStation[];
    setRadiusDisplayValue: (value: string) => void;
    setRadiusUnit: (unit: HidingZoneUnit) => void;
    stationFeatures: StationFeatureCollection;
    suggestedPresetIds: string[];
    togglePreset: (presetId: string) => void;
    zoneFeatures: ZoneFeatureCollection;
};

const HidingZoneContext = createContext<HidingZoneState | null>(null);

export function HidingZoneProvider({ children }: { children: ReactNode }) {
    const { playArea } = usePlayArea();
    const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
    const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
    const [radiusUnit, setRadiusUnitState] = useState<HidingZoneUnit>("m");
    const [radiusDisplayValue, setRadiusDisplayValueState] = useState("600");

    const suggestedPresetIds = useMemo(
        () => getSuggestedPresetIds(hidingZonePresets, playArea.bbox),
        [playArea.bbox],
    );

    const selectedPresets = useMemo(
        () => getSelectedPresets(hidingZonePresets, selectedPresetIds),
        [selectedPresetIds],
    );
    const selectedRoutes = useMemo(
        () => getSelectedRoutes(selectedPresets),
        [selectedPresets],
    );
    const selectedStations = useMemo(
        () => getSelectedStations(selectedPresets),
        [selectedPresets],
    );
    const routeFeatures = useMemo(
        () => buildRouteFeatureCollection(selectedPresets),
        [selectedPresets],
    );
    const stationFeatures = useMemo(
        () => buildStationFeatureCollection(selectedStations),
        [selectedStations],
    );
    const zoneFeatures = useMemo(
        () => buildHidingZoneFeatureCollection(selectedStations, radiusMeters),
        [radiusMeters, selectedStations],
    );

    const addPreset = useCallback((presetId: string) => {
        setSelectedPresetIds((current) =>
            current.includes(presetId) ? current : [...current, presetId],
        );
    }, []);

    const removePreset = useCallback((presetId: string) => {
        setSelectedPresetIds((current) =>
            current.filter((id) => id !== presetId),
        );
    }, []);

    const replaceSetup = useCallback((nextSetup: HidingZoneImportState) => {
        setSelectedPresetIds(nextSetup.selectedPresetIds);
        setRadiusMeters(nextSetup.radiusMeters);
        setRadiusUnitState(nextSetup.radiusUnit);
        setRadiusDisplayValueState(
            fromMeters(nextSetup.radiusMeters, nextSetup.radiusUnit),
        );
    }, []);

    const togglePreset = useCallback(
        (presetId: string) => {
            if (selectedPresetIds.includes(presetId)) removePreset(presetId);
            else addPreset(presetId);
        },
        [addPreset, removePreset, selectedPresetIds],
    );

    const setRadiusDisplayValue = useCallback(
        (value: string) => {
            setRadiusDisplayValueState(value);
            const meters = toMeters(value, radiusUnit);
            if (meters !== null) setRadiusMeters(meters);
        },
        [radiusUnit],
    );

    const setRadiusUnit = useCallback(
        (unit: HidingZoneUnit) => {
            setRadiusUnitState(unit);
            setRadiusDisplayValueState(fromMeters(radiusMeters, unit));
        },
        [radiusMeters],
    );

    const value = useMemo<HidingZoneState>(
        () => ({
            addPreset,
            presets: hidingZonePresets,
            radiusDisplayValue,
            radiusMeters,
            radiusUnit,
            removePreset,
            replaceSetup,
            routeFeatures,
            selectedPresetIds,
            selectedPresets,
            selectedRoutes,
            selectedStations,
            setRadiusDisplayValue,
            setRadiusUnit,
            stationFeatures,
            suggestedPresetIds,
            togglePreset,
            zoneFeatures,
        }),
        [
            addPreset,
            radiusDisplayValue,
            radiusMeters,
            radiusUnit,
            removePreset,
            replaceSetup,
            routeFeatures,
            selectedPresetIds,
            selectedPresets,
            selectedRoutes,
            selectedStations,
            setRadiusDisplayValue,
            setRadiusUnit,
            stationFeatures,
            suggestedPresetIds,
            togglePreset,
            zoneFeatures,
        ],
    );

    return (
        <HidingZoneContext.Provider value={value}>
            {children}
        </HidingZoneContext.Provider>
    );
}

export function useHidingZone() {
    const context = useContext(HidingZoneContext);
    if (!context) {
        throw new Error(
            "useHidingZone must be used within HidingZoneProvider.",
        );
    }
    return context;
}
