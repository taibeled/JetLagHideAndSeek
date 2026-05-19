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
        activeQuestionId,
        createRadiusQuestion,
        deleteQuestion,
        isPinLocked,
        isQuestionSheetActive,
        isRestored,
        questions,
        setPinLocked,
        setQuestionSheetActive,
        setRadiusOption,
    } = useQuestion();

    return (
        <View>
            <Text testID="probe-restored">{String(isRestored)}</Text>
            <Text testID="probe-count">{questions.length}</Text>
            <Text testID="probe-active-id">{activeQuestionId ?? "none"}</Text>
            <Text testID="probe-question-ids">
                {questions.map((question) => question.id).join(",")}
            </Text>
            <Text testID="probe-radius">
                {activeQuestion?.radiusMeters ?? "none"}
            </Text>
            <Text testID="probe-option">
                {activeQuestion?.radiusOption ?? "none"}
            </Text>
            <Text testID="probe-sheet-active">
                {String(isQuestionSheetActive)}
            </Text>
            <Text testID="probe-locked">{String(isPinLocked)}</Text>
            <Pressable
                accessibilityRole="button"
                testID="action-create"
                onPress={() => createRadiusQuestion(defaultPlayArea.center)}
            />
            <Pressable
                accessibilityRole="button"
                testID="action-delete-active"
                onPress={() =>
                    activeQuestion ? deleteQuestion(activeQuestion.id) : null
                }
            />
            <Pressable
                accessibilityRole="button"
                testID="action-delete-first"
                onPress={() =>
                    questions[0] ? deleteQuestion(questions[0].id) : null
                }
            />
            <Pressable
                accessibilityRole="button"
                testID="action-delete-unknown"
                onPress={() => deleteQuestion("q-missing")}
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
                onPress={() => setPinLocked(true)}
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

    it("deletes the active question and clears the active id", async () => {
        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        act(() => {
            fireEvent.press(screen.getByTestId("action-create"));
        });
        const questionId = screen.getByTestId("probe-active-id").props.children;

        act(() => {
            fireEvent.press(screen.getByTestId("action-delete-active"));
        });

        expect(screen.getByTestId("probe-count")).toHaveTextContent("0");
        expect(screen.getByTestId("probe-active-id")).toHaveTextContent("none");
        expect(screen.getByTestId("probe-question-ids")).not.toHaveTextContent(
            questionId,
        );
    });

    it("preserves the active question when deleting a different question", async () => {
        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        act(() => {
            fireEvent.press(screen.getByTestId("action-create"));
            fireEvent.press(screen.getByTestId("action-create"));
        });
        const activeQuestionId =
            screen.getByTestId("probe-active-id").props.children;

        act(() => {
            fireEvent.press(screen.getByTestId("action-delete-first"));
        });

        expect(screen.getByTestId("probe-count")).toHaveTextContent("1");
        expect(screen.getByTestId("probe-active-id")).toHaveTextContent(
            activeQuestionId,
        );
    });

    it("ignores unknown question ids", async () => {
        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        act(() => {
            fireEvent.press(screen.getByTestId("action-create"));
        });
        const questionIds =
            screen.getByTestId("probe-question-ids").props.children;

        act(() => {
            fireEvent.press(screen.getByTestId("action-delete-unknown"));
        });

        expect(screen.getByTestId("probe-count")).toHaveTextContent("1");
        expect(screen.getByTestId("probe-question-ids")).toHaveTextContent(
            questionIds,
        );
    });

    it("persists deleted questions", async () => {
        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        act(() => {
            fireEvent.press(screen.getByTestId("action-create"));
        });
        await waitFor(async () => {
            const persisted = await loadPersistedAppState();
            expect(persisted?.questions).toHaveLength(1);
        });

        act(() => {
            fireEvent.press(screen.getByTestId("action-delete-active"));
        });

        await waitFor(async () => {
            const persisted = await loadPersistedAppState();
            expect(persisted?.questions).toEqual([]);
        });
    });

    it("keeps the pin lock preference when the question sheet becomes inactive", async () => {
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

        expect(screen.getByTestId("probe-locked")).toHaveTextContent("true");

        act(() => {
            fireEvent.press(screen.getByTestId("action-sheet-inactive"));
        });

        expect(screen.getByTestId("probe-locked")).toHaveTextContent("true");
    });

    it("persists the pin lock preference", async () => {
        const screen = renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId("probe-restored")).toHaveTextContent(
                "true",
            );
        });

        act(() => {
            fireEvent.press(screen.getByTestId("action-moving"));
        });

        await waitFor(async () => {
            const persisted = await loadPersistedAppState();
            expect(persisted?.questionSettings.isPinLocked).toBe(true);
        });
    });
});
