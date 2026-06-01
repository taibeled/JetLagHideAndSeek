import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    getHidingZonePresetsOrEmpty,
    loadHidingZonePresets,
} from "@/features/hidingZone/hidingZoneData";
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
const ZONE_GEOMETRY_DEBOUNCE_MS = 300;

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
    const [zoneGeometryRadiusMeters, setZoneGeometryRadiusMeters] = useState(
        DEFAULT_RADIUS_METERS,
    );
    const [radiusUnit, setRadiusUnitState] = useState<HidingZoneUnit>("m");
    const [radiusDisplayValue, setRadiusDisplayValueState] = useState("600");
    const [isRestored, setIsRestored] = useState(false);
    const [presetsRevision, setPresetsRevision] = useState(0);
    const radiusMetersRef = useRef(DEFAULT_RADIUS_METERS);
    const zoneGeometryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );

    // Load the 294 KB preset JSON asynchronously so it doesn't block the
    // JS thread during initial bundle evaluation.
    useEffect(() => {
        let cancelled = false;
        loadHidingZonePresets().then(() => {
            if (!cancelled) setPresetsRevision((n) => n + 1);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const presets = getHidingZonePresetsOrEmpty();

    const suggestedPresetIds = useMemo(
        () => getSuggestedPresetIds(presets, playArea.bbox),
        // Recompute when presets finish loading (revision bump) or bbox changes.
        [playArea.bbox, presetsRevision],
    );

    const selectedPresets = useMemo(
        () => getSelectedPresets(presets, selectedPresetIds),
        [selectedPresetIds, presetsRevision],
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
        () =>
            buildHidingZoneFeatureCollection(
                selectedStations,
                zoneGeometryRadiusMeters,
            ),
        [selectedStations, zoneGeometryRadiusMeters],
    );

    const syncZoneGeometryRadius = useCallback((nextRadiusMeters: number) => {
        if (zoneGeometryTimerRef.current) {
            clearTimeout(zoneGeometryTimerRef.current);
            zoneGeometryTimerRef.current = null;
        }
        setZoneGeometryRadiusMeters(nextRadiusMeters);
    }, []);

    const addPreset = useCallback(
        (presetId: string) => {
            syncZoneGeometryRadius(radiusMetersRef.current);
            setSelectedPresetIds((current) =>
                current.includes(presetId) ? current : [...current, presetId],
            );
        },
        [syncZoneGeometryRadius],
    );

    const removePreset = useCallback(
        (presetId: string) => {
            syncZoneGeometryRadius(radiusMetersRef.current);
            setSelectedPresetIds((current) =>
                current.filter((id) => id !== presetId),
            );
        },
        [syncZoneGeometryRadius],
    );

    const replaceSetup = useCallback(
        (nextSetup: HidingZoneImportState) => {
            syncZoneGeometryRadius(nextSetup.radiusMeters);
            radiusMetersRef.current = nextSetup.radiusMeters;
            setSelectedPresetIds(nextSetup.selectedPresetIds);
            setRadiusMeters(nextSetup.radiusMeters);
            setRadiusUnitState(nextSetup.radiusUnit);
            setRadiusDisplayValueState(
                fromMeters(nextSetup.radiusMeters, nextSetup.radiusUnit),
            );
        },
        [syncZoneGeometryRadius],
    );

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
            if (meters === null) return;

            radiusMetersRef.current = meters;
            setRadiusMeters(meters);
            if (zoneGeometryTimerRef.current) {
                clearTimeout(zoneGeometryTimerRef.current);
            }
            zoneGeometryTimerRef.current = setTimeout(() => {
                zoneGeometryTimerRef.current = null;
                setZoneGeometryRadiusMeters(meters);
            }, ZONE_GEOMETRY_DEBOUNCE_MS);
        },
        [radiusUnit],
    );

    const setRadiusUnit = useCallback((unit: HidingZoneUnit) => {
        setRadiusUnitState(unit);
        setRadiusDisplayValueState(fromMeters(radiusMetersRef.current, unit));
    }, []);

    const markRestored = useCallback(() => {
        setIsRestored(true);
    }, []);

    useEffect(() => {
        return () => {
            if (zoneGeometryTimerRef.current) {
                clearTimeout(zoneGeometryTimerRef.current);
            }
        };
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
            presets,
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
