import { fireEvent, render } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { buildAppStateEnvelope } from "@/sharing/export/buildEnvelope";
import { ImportScreen } from "@/sharing/import/ImportScreen";
import { buildImportLink } from "@/sharing/links/buildLink";
import { AppStateProviders } from "@/state/AppStateProviders";
import { useHidingZone } from "@/state/hidingZoneStore";
import { usePlayArea } from "@/state/playAreaStore";

const { useLocalSearchParams, useRouter } = jest.requireMock("expo-router") as {
    useLocalSearchParams: jest.Mock;
    useRouter: jest.Mock;
};

function StoreProbe() {
    const { playArea } = usePlayArea();
    const { radiusMeters, selectedPresetIds } = useHidingZone();

    return (
        <View>
            <Text testID="probe-play-area">{playArea.label}</Text>
            <Text testID="probe-radius">{radiusMeters}</Text>
            <Text testID="probe-presets">{selectedPresetIds.join(",")}</Text>
        </View>
    );
}

function getPayloadFromLink(link: string) {
    return new URL(link).searchParams.get("d")!;
}

describe("ImportScreen", () => {
    beforeEach(() => {
        useRouter.mockReturnValue({ replace: jest.fn() });
    });

    it("previews before mutating and applies after confirmation", () => {
        const envelope = buildAppStateEnvelope({
            gameId: "shared-game",
            hidingZones: {
                radiusMeters: 900,
                radiusUnit: "m",
                selectedPresetIds: ["tokyo-metro"],
            },
            now: new Date("2026-05-17T00:00:00.000Z"),
            playArea: {
                bbox: [10, 20, 30, 40],
                boundary: { features: [], type: "FeatureCollection" },
                center: [20, 30],
                label: "Shared Area",
                osmId: 999,
                osmType: "R",
            },
        });
        const link = buildImportLink({ envelope, mode: "custom-scheme" });
        useLocalSearchParams.mockReturnValue({ d: getPayloadFromLink(link) });

        const screen = render(
            <AppStateProviders>
                <ImportScreen />
                <StoreProbe />
            </AppStateProviders>,
        );

        expect(screen.getByTestId("import-preview-card")).toBeTruthy();
        expect(screen.getByTestId("probe-play-area").props.children).toBe(
            "Tokyo 23 Wards",
        );

        fireEvent.press(screen.getByTestId("import-confirm-button"));

        expect(screen.getByTestId("probe-play-area").props.children).toBe(
            "Shared Area",
        );
        expect(screen.getByTestId("probe-radius").props.children).toBe(900);
        expect(screen.getByTestId("probe-presets").props.children).toBe(
            "tokyo-metro",
        );
    });
});
