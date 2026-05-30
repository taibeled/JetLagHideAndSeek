import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { deflateSync, strToU8 } from "fflate";
import { Text, View } from "react-native";

import { defaultPlayArea } from "@/features/map/playArea";
import { buildAppStateEnvelope } from "@/sharing/export/buildEnvelope";
import { ImportScreen } from "@/sharing/import/ImportScreen";
import { buildImportLink } from "@/sharing/links/buildLink";
import { bytesToBase64Url } from "@/sharing/wire/base64url";
import { canonicalize } from "@/sharing/wire/canonicalize";
import { minifyEnvelope } from "@/sharing/wire/minified";
import { AppStateProviders } from "@/state/AppStateProviders";
import { useHidingZoneState } from "@/state/hidingZoneStore";
import { usePlayArea } from "@/state/playAreaStore";
import { useQuestionState } from "@/state/questionStore";

const { useLocalSearchParams, useRouter } = jest.requireMock("expo-router") as {
    useLocalSearchParams: jest.Mock;
    useRouter: jest.Mock;
};

function StoreProbe() {
    const { playArea } = usePlayArea();
    const { radiusMeters, selectedPresetIds } = useHidingZoneState();
    const { questions } = useQuestionState();
    const matchingQuestion = questions.find(
        (question) => question.type === "matching",
    );

    return (
        <View>
            <Text testID="probe-play-area">{playArea.label}</Text>
            <Text testID="probe-radius">{radiusMeters}</Text>
            <Text testID="probe-presets">{selectedPresetIds.join(",")}</Text>
            <Text testID="probe-line-id">
                {matchingQuestion?.lineId ?? "none"}
            </Text>
            <Text testID="probe-line-answer">
                {matchingQuestion?.answer ?? "none"}
            </Text>
        </View>
    );
}

function getPayloadFromLink(link: string) {
    return new URL(link).searchParams.get("d")!;
}

describe("ImportScreen", () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        useRouter.mockReturnValue({ replace: jest.fn() });
    });

    it("previews before mutating and applies after confirmation", async () => {
        const envelope = buildAppStateEnvelope({
            gameId: "shared-game",
            hidingZones: {
                radiusMeters: 900,
                radiusUnit: "m",
                selectedPresetIds: ["tokyo-metro"],
            },
            now: new Date("2026-05-17T00:00:00.000Z"),
            playArea: defaultPlayArea,
        });
        const link = buildImportLink({ envelope, mode: "custom-scheme" });
        useLocalSearchParams.mockReturnValue({ d: getPayloadFromLink(link) });

        const screen = render(
            <AppStateProviders>
                <ImportScreen />
                <StoreProbe />
            </AppStateProviders>,
        );

        await waitFor(() => {
            expect(screen.getByTestId("import-preview-card")).toBeTruthy();
        });
        expect(screen.getByTestId("probe-play-area").props.children).toBe(
            "Tokyo 23 Wards",
        );

        fireEvent.press(screen.getByTestId("import-confirm-button"));

        expect(screen.getByTestId("probe-play-area").props.children).toBe(
            "Tokyo 23 Wards",
        );
        expect(screen.getByTestId("probe-radius").props.children).toBe(900);
        expect(screen.getByTestId("probe-presets").props.children).toBe(
            "tokyo-metro",
        );
    });

    it("clears legacy transit line selections from shared payloads", async () => {
        const envelope = buildAppStateEnvelope({
            gameId: "shared-game",
            hidingZones: {
                radiusMeters: 600,
                radiusUnit: "m",
                selectedPresetIds: ["tokyo-metro"],
            },
            now: new Date("2026-05-17T00:00:00.000Z"),
            playArea: defaultPlayArea,
            questions: [
                {
                    answer: "positive",
                    center: defaultPlayArea.center,
                    createdAt: "2026-05-17T00:00:00.000Z",
                    id: "matching-1",
                    lineId: "tokyo-metro:3",
                    lineName: "Hibiya Line",
                    type: "matching",
                    updatedAt: "2026-05-17T00:00:00.000Z",
                },
            ],
        });
        const payload = bytesToBase64Url(
            deflateSync(strToU8(canonicalize(minifyEnvelope(envelope)))),
        );
        useLocalSearchParams.mockReturnValue({ d: payload });

        const screen = render(
            <AppStateProviders>
                <ImportScreen />
                <StoreProbe />
            </AppStateProviders>,
        );

        await waitFor(() => {
            expect(screen.getByTestId("import-preview-card")).toBeTruthy();
        });
        fireEvent.press(screen.getByTestId("import-confirm-button"));

        expect(screen.getByTestId("probe-line-id")).toHaveTextContent("none");
        expect(screen.getByTestId("probe-line-answer")).toHaveTextContent(
            "unanswered",
        );
    });
});
