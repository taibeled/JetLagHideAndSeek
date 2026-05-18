import { act, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text, View } from "react-native";

import { defaultPlayArea } from "@/features/map/playArea";
import { createAppStateV1 } from "@/state/appState";
import { AppStateProviders } from "@/state/AppStateProviders";
import { loadPersistedAppState, persistAppState } from "@/state/persistence";
import {
    type HidingZoneImportState,
    useHidingZone,
} from "@/state/hidingZoneStore";

function Probe() {
    const { isRestored, radiusMeters, radiusUnit, selectedPresetIds } =
        useHidingZone();
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
            | ReturnType<typeof useHidingZone>["setRadiusDisplayValue"]
            | null = null;

        function ActionProbe() {
            const ctx = useHidingZone();
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
            | ReturnType<typeof useHidingZone>["setRadiusUnit"]
            | null = null;

        function ActionProbe() {
            const ctx = useHidingZone();
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
            | ReturnType<typeof useHidingZone>["togglePreset"]
            | null = null;

        function ActionProbe() {
            const ctx = useHidingZone();
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
