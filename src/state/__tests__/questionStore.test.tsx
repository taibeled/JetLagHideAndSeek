import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, Text, View } from "react-native";

import { defaultPlayArea } from "@/features/map/playArea";
import { createAppStateV1 } from "@/state/appState";
import { AppStateProviders } from "@/state/AppStateProviders";
import { loadPersistedAppState, persistAppState } from "@/state/persistence";
import { useQuestion } from "@/state/questionStore";

function Probe() {
    const {
        activeQuestion,
        createRadiusQuestion,
        isMovePinEnabled,
        isQuestionSheetActive,
        isRestored,
        questions,
        setMovePinEnabled,
        setQuestionSheetActive,
        setRadiusOption,
    } = useQuestion();

    return (
        <View>
            <Text testID="probe-restored">{String(isRestored)}</Text>
            <Text testID="probe-count">{questions.length}</Text>
            <Text testID="probe-radius">
                {activeQuestion?.radiusMeters ?? "none"}
            </Text>
            <Text testID="probe-option">
                {activeQuestion?.radiusOption ?? "none"}
            </Text>
            <Text testID="probe-sheet-active">
                {String(isQuestionSheetActive)}
            </Text>
            <Text testID="probe-moving">{String(isMovePinEnabled)}</Text>
            <Pressable
                accessibilityRole="button"
                testID="action-create"
                onPress={() => createRadiusQuestion(defaultPlayArea.center)}
            />
            <Pressable
                accessibilityRole="button"
                testID="action-option-1km"
                onPress={() =>
                    activeQuestion
                        ? setRadiusOption(activeQuestion.id, "1km")
                        : null
                }
            />
            <Pressable
                accessibilityRole="button"
                testID="action-sheet-inactive"
                onPress={() => setQuestionSheetActive(false)}
            />
            <Pressable
                accessibilityRole="button"
                testID="action-moving"
                onPress={() => setMovePinEnabled(true)}
            />
        </View>
    );
}

function renderProvider() {
    return render(
        <AppStateProviders>
            <Probe />
        </AppStateProviders>,
    );
}

describe("QuestionProvider", () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    it("creates a default 500m radius question", async () => {
        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        act(() => {
            fireEvent.press(screen.getByTestId("action-create"));
        });

        expect(screen.getByTestId("probe-count")).toHaveTextContent("1");
        expect(screen.getByTestId("probe-radius")).toHaveTextContent("500");
        expect(screen.getByTestId("probe-option")).toHaveTextContent("500m");
    });

    it("updates preset radius options and persists questions", async () => {
        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        act(() => {
            fireEvent.press(screen.getByTestId("action-create"));
        });
        act(() => {
            fireEvent.press(screen.getByTestId("action-option-1km"));
        });

        await waitFor(async () => {
            const persisted = await loadPersistedAppState();
            expect(persisted?.questions[0].radiusMeters).toBe(1000);
            expect(persisted?.questions[0].radiusOption).toBe("1km");
        });
    });

    it("restores persisted radius questions", async () => {
        await persistAppState(
            createAppStateV1({
                hidingZones: {
                    radiusMeters: 600,
                    radiusUnit: "m",
                    selectedPresetIds: [],
                },
                playArea: defaultPlayArea,
                questions: [
                    {
                        center: defaultPlayArea.center,
                        createdAt: "2026-05-18T00:00:00.000Z",
                        id: "q-1",
                        radiusMeters: 2000,
                        radiusOption: "2km",
                        radiusUnit: "m",
                        type: "radius",
                        updatedAt: "2026-05-18T00:00:00.000Z",
                    },
                ],
            }),
        );

        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        expect(screen.getByTestId("probe-count")).toHaveTextContent("1");
    });

    it("disables moving when the question sheet becomes inactive", async () => {
        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        act(() => {
            fireEvent.press(screen.getByTestId("action-create"));
            fireEvent.press(screen.getByTestId("action-moving"));
        });

        expect(screen.getByTestId("probe-moving")).toHaveTextContent("true");

        act(() => {
            fireEvent.press(screen.getByTestId("action-sheet-inactive"));
        });

        expect(screen.getByTestId("probe-moving")).toHaveTextContent("false");
    });
});
