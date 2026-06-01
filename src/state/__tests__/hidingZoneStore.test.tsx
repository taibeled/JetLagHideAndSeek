import { act, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text, View } from "react-native";

import { defaultPlayArea } from "@/features/map/playArea";
import { createAppStateV1 } from "@/state/appState";
import { AppStateProviders } from "@/state/AppStateProviders";
import { loadPersistedAppState, persistAppState } from "@/state/persistence";
import {
    type HidingZoneImportState,
    useHidingZoneActions,
    useHidingZoneDerived,
    useHidingZoneState,
    HidingZoneProvider,
} from "@/state/hidingZoneStore";
import { PlayAreaProvider } from "@/state/playAreaStore";

function Probe() {
    const { isRestored, radiusMeters, radiusUnit, selectedPresetIds } =
        useHidingZoneState();
    return (
        <View>
            <Text testID="probe-restored">{String(isRestored)}</Text>
            <Text testID="probe-radius-meters">{radiusMeters}</Text>
            <Text testID="probe-radius-unit">{radiusUnit}</Text>
            <Text testID="probe-preset-ids">{selectedPresetIds.join(",")}</Text>
        </View>
    );
}

function renderProvider(children = <Probe />) {
    return render(<AppStateProviders>{children}</AppStateProviders>);
}

function makeAppState(
    hidingZones: HidingZoneImportState = {
        radiusMeters: 600,
        radiusUnit: "m",
        selectedPresetIds: [],
    },
) {
    return createAppStateV1({
        hidingZones,
        now: new Date("2026-05-18T00:00:00.000Z"),
        playArea: defaultPlayArea,
    });
}

describe("HidingZoneProvider app-state persistence", () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    it("uses defaults when nothing is persisted", async () => {
        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        expect(screen.getByTestId("probe-radius-meters")).toHaveTextContent(
            "600",
        );
        expect(screen.getByTestId("probe-radius-unit")).toHaveTextContent("m");
        expect(screen.getByTestId("probe-preset-ids")).toHaveTextContent("");
    });

    it("restores persisted hiding zones on mount", async () => {
        await persistAppState(
            makeAppState({
                radiusMeters: 900,
                radiusUnit: "km",
                selectedPresetIds: ["tokyo-metro", "toei"],
            }),
        );

        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        expect(screen.getByTestId("probe-radius-meters")).toHaveTextContent(
            "900",
        );
        expect(screen.getByTestId("probe-radius-unit")).toHaveTextContent("km");
        expect(screen.getByTestId("probe-preset-ids")).toHaveTextContent(
            "tokyo-metro,toei",
        );
    });

    it("persists defaults after initial restore completes", async () => {
        renderProvider();

        await waitFor(async () => {
            const persisted = await loadPersistedAppState();
            expect(persisted?.hidingZones).toEqual({
                radiusMeters: 600,
                radiusUnit: "m",
                selectedPresetIds: [],
            });
            expect(persisted?.questions).toEqual([]);
        });
    });

    it("persists when radiusMeters changes", async () => {
        let setRadiusDisplayValueFn:
            | ReturnType<typeof useHidingZoneActions>["setRadiusDisplayValue"]
            | null = null;

        function ActionProbe() {
            const ctx = useHidingZoneActions();
            setRadiusDisplayValueFn = ctx.setRadiusDisplayValue;
            return <Probe />;
        }

        const screen = renderProvider(<ActionProbe />);

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        expect(setRadiusDisplayValueFn).not.toBeNull();
        act(() => {
            setRadiusDisplayValueFn!("800");
        });

        await waitFor(async () => {
            const persisted = await loadPersistedAppState();
            expect(persisted?.hidingZones.radiusMeters).toBe(800);
            expect(persisted?.questions).toEqual([]);
        });
    });

    it("persists when radiusUnit changes", async () => {
        let setRadiusUnitFn:
            | ReturnType<typeof useHidingZoneActions>["setRadiusUnit"]
            | null = null;

        function ActionProbe() {
            const ctx = useHidingZoneActions();
            setRadiusUnitFn = ctx.setRadiusUnit;
            return <Probe />;
        }

        const screen = renderProvider(<ActionProbe />);

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        expect(setRadiusUnitFn).not.toBeNull();
        act(() => {
            setRadiusUnitFn!("km");
        });

        await waitFor(async () => {
            const persisted = await loadPersistedAppState();
            expect(persisted?.hidingZones.radiusUnit).toBe("km");
            expect(persisted?.questions).toEqual([]);
        });
    });

    it("persists when selectedPresetIds change via togglePreset", async () => {
        let togglePresetFn:
            | ReturnType<typeof useHidingZoneActions>["togglePreset"]
            | null = null;

        function ActionProbe() {
            const ctx = useHidingZoneActions();
            togglePresetFn = ctx.togglePreset;
            return <Probe />;
        }

        const screen = renderProvider(<ActionProbe />);

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        expect(togglePresetFn).not.toBeNull();
        act(() => {
            togglePresetFn!("tokyo-metro");
        });

        await waitFor(async () => {
            const persisted = await loadPersistedAppState();
            expect(persisted?.hidingZones.selectedPresetIds).toEqual([
                "tokyo-metro",
            ]);
            expect(persisted?.questions).toEqual([]);
        });
    });

    it("does not persist before restore completes", async () => {
        await persistAppState(
            makeAppState({
                radiusMeters: 700,
                radiusUnit: "km",
                selectedPresetIds: ["toei"],
            }),
        );

        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        const persisted = await loadPersistedAppState();
        expect(persisted?.hidingZones.radiusMeters).toBe(700);
        expect(persisted?.hidingZones.radiusUnit).toBe("km");
        expect(persisted?.hidingZones.selectedPresetIds).toEqual(["toei"]);
    });
});

describe("HidingZoneProvider zone geometry updates", () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it("debounces radius edits but flushes geometry for imports and preset changes", async () => {
        let actions: ReturnType<typeof useHidingZoneActions> | null = null;

        function GeometryProbe() {
            actions = useHidingZoneActions();
            const { radiusMeters } = useHidingZoneState();
            const { presets, zoneFeatures } = useHidingZoneDerived();
            const geometryRadius =
                zoneFeatures.features[0]?.properties.radiusMeters ?? "empty";

            return (
                <View>
                    <Text testID="probe-preset-count">{presets.length}</Text>
                    <Text testID="probe-canonical-radius">{radiusMeters}</Text>
                    <Text testID="probe-geometry-radius">{geometryRadius}</Text>
                </View>
            );
        }

        const screen = render(
            <PlayAreaProvider>
                <HidingZoneProvider>
                    <GeometryProbe />
                </HidingZoneProvider>
            </PlayAreaProvider>,
        );

        await waitFor(() => {
            expect(
                screen.getByTestId("probe-preset-count"),
            ).not.toHaveTextContent("0");
        });

        act(() => {
            actions!.addPreset("tokyo-metro");
        });
        await waitFor(() => {
            expect(
                screen.getByTestId("probe-geometry-radius"),
            ).toHaveTextContent("600");
        });

        jest.useFakeTimers();
        act(() => {
            actions!.setRadiusDisplayValue("5");
            actions!.setRadiusDisplayValue("50");
            actions!.setRadiusDisplayValue("500");
        });

        expect(screen.getByTestId("probe-canonical-radius")).toHaveTextContent(
            "500",
        );
        expect(screen.getByTestId("probe-geometry-radius")).toHaveTextContent(
            "600",
        );

        act(() => {
            jest.advanceTimersByTime(299);
        });
        expect(screen.getByTestId("probe-geometry-radius")).toHaveTextContent(
            "600",
        );

        act(() => {
            jest.advanceTimersByTime(1);
        });
        expect(screen.getByTestId("probe-geometry-radius")).toHaveTextContent(
            "500",
        );

        act(() => {
            actions!.setRadiusDisplayValue("700");
            actions!.replaceSetup({
                radiusMeters: 900,
                radiusUnit: "m",
                selectedPresetIds: ["tokyo-metro"],
            });
        });
        expect(screen.getByTestId("probe-canonical-radius")).toHaveTextContent(
            "900",
        );
        expect(screen.getByTestId("probe-geometry-radius")).toHaveTextContent(
            "900",
        );

        act(() => {
            actions!.setRadiusDisplayValue("800");
            actions!.addPreset("toei-subway");
        });
        expect(screen.getByTestId("probe-canonical-radius")).toHaveTextContent(
            "800",
        );
        expect(screen.getByTestId("probe-geometry-radius")).toHaveTextContent(
            "800",
        );
    });
});
