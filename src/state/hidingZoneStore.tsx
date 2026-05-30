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
    getSelectedPresets,
    getSelectedRoutes,
    getSelectedStations,
    getSuggestedPresetIds,
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
import { fromMeters, toMeters } from "@/shared/distanceUnits";

const DEFAULT_RADIUS_METERS = 600;

export type HidingZoneImportState = {
    radiusMeters: number;
    radiusUnit: HidingZoneUnit;
    selectedPresetIds: string[];
};

// ---------------------------------------------------------------------------
// State context — scalar values that change frequently
// ---------------------------------------------------------------------------

type HidingZoneStateValue = {
    isRestored: boolean;
    radiusDisplayValue: string;
    radiusMeters: number;
    radiusUnit: HidingZoneUnit;
    selectedPresetIds: string[];
};

const HidingZoneStateContext = createContext<HidingZoneStateValue | null>(null);

export function useHidingZoneState(): HidingZoneStateValue {
    const context = useContext(HidingZoneStateContext);
    if (!context) {
        throw new Error(
            "useHidingZoneState must be used within HidingZoneProvider.",
        );
    }
    return context;
}

// ---------------------------------------------------------------------------
// Actions context — stable callbacks
// ---------------------------------------------------------------------------

type HidingZoneActionsValue = {
    addPreset: (presetId: string) => void;
    markRestored: () => void;
    removePreset: (presetId: string) => void;
    replaceSetup: (nextSetup: HidingZoneImportState) => void;
    setRadiusDisplayValue: (value: string) => void;
    setRadiusUnit: (unit: HidingZoneUnit) => void;
    togglePreset: (presetId: string) => void;
};

const HidingZoneActionsContext = createContext<HidingZoneActionsValue | null>(
    null,
);

export function useHidingZoneActions(): HidingZoneActionsValue {
    const context = useContext(HidingZoneActionsContext);
    if (!context) {
        throw new Error(
            "useHidingZoneActions must be used within HidingZoneProvider.",
        );
    }
    return context;
}

// ---------------------------------------------------------------------------
// Derived context — computed GeoJSON / feature collections
// ---------------------------------------------------------------------------

type HidingZoneDerivedValue = {
    presets: HidingZonePreset[];
    routeFeatures: RouteFeatureCollection;
    selectedPresets: HidingZonePreset[];
    selectedRoutes: TransitRoute[];
    selectedStations: TransitStation[];
    stationFeatures: StationFeatureCollection;
    suggestedPresetIds: string[];
    zoneFeatures: ZoneFeatureCollection;
};

const HidingZoneDerivedContext = createContext<HidingZoneDerivedValue | null>(
    null,
);

export function useHidingZoneDerived(): HidingZoneDerivedValue {
    const context = useContext(HidingZoneDerivedContext);
    if (!context) {
        throw new Error(
            "useHidingZoneDerived must be used within HidingZoneProvider.",
        );
    }
    return context;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function HidingZoneProvider({ children }: { children: ReactNode }) {
    const { playArea } = usePlayArea();
    const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
    const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
    const [radiusUnit, setRadiusUnitState] = useState<HidingZoneUnit>("m");
    const [radiusDisplayValue, setRadiusDisplayValueState] = useState("600");
    const [isRestored, setIsRestored] = useState(false);

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

    const markRestored = useCallback(() => {
        setIsRestored(true);
    }, []);

    const stateValue = useMemo<HidingZoneStateValue>(
        () => ({
            isRestored,
            radiusDisplayValue,
            radiusMeters,
            radiusUnit,
            selectedPresetIds,
        }),
        [
            isRestored,
            radiusDisplayValue,
            radiusMeters,
            radiusUnit,
            selectedPresetIds,
        ],
    );

    const actionsValue = useMemo<HidingZoneActionsValue>(
        () => ({
            addPreset,
            markRestored,
            removePreset,
            replaceSetup,
            setRadiusDisplayValue,
            setRadiusUnit,
            togglePreset,
        }),
        [
            addPreset,
            markRestored,
            removePreset,
            replaceSetup,
            setRadiusDisplayValue,
            setRadiusUnit,
            togglePreset,
        ],
    );

    const derivedValue = useMemo<HidingZoneDerivedValue>(
        () => ({
            presets: hidingZonePresets,
            routeFeatures,
            selectedPresets,
            selectedRoutes,
            selectedStations,
            stationFeatures,
            suggestedPresetIds,
            zoneFeatures,
        }),
        [
            routeFeatures,
            selectedPresets,
            selectedRoutes,
            selectedStations,
            stationFeatures,
            suggestedPresetIds,
            zoneFeatures,
        ],
    );

    return (
        <HidingZoneStateContext.Provider value={stateValue}>
            <HidingZoneActionsContext.Provider value={actionsValue}>
                <HidingZoneDerivedContext.Provider value={derivedValue}>
                    {children}
                </HidingZoneDerivedContext.Provider>
            </HidingZoneActionsContext.Provider>
        </HidingZoneStateContext.Provider>
    );
}
