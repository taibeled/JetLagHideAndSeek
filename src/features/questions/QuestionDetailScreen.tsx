import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { requestUserCoordinate } from "@/shared/location";
import { OsmMatchingQuestionDetailScreen } from "@/features/questions/matching/OsmMatchingQuestionDetailScreen";
import { RadarQuestionDetailScreen } from "@/features/questions/radar/RadarQuestionDetailScreen";
import { TransitLineQuestionDetailScreen } from "@/features/questions/transitLine/TransitLineQuestionDetailScreen";
import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import {
    updateQuestionCenter,
    useQuestionActions,
    useQuestionDerived,
    useQuestionState,
} from "@/state/questionStore";
import { colors } from "@/theme/colors";

type QuestionDetailScreenProps = {
    sheetIndex: number;
};

export function QuestionDetailScreen({
    sheetIndex,
}: QuestionDetailScreenProps) {
    const { activeQuestion } = useQuestionDerived();
    const { updateQuestion } = useQuestionActions();

    if (!activeQuestion) {
        return (
            <SheetScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.emptyTitle}>No Question Selected</Text>
                <Text style={styles.emptyDetail}>
                    Return to the question list and choose a question.
                </Text>
            </SheetScrollView>
        );
    }

    return (
        <SheetScrollView
            contentContainerStyle={styles.scrollContent}
            style={styles.container}
        >
            {activeQuestion.type === "radar" ? (
                <RadarQuestionDetailScreen
                    question={activeQuestion}
                    sheetIndex={sheetIndex}
                    updateQuestion={updateQuestion}
                />
            ) : activeQuestion.type === "matching" &&
              activeQuestion.category === "transit-line" ? (
                <TransitLineQuestionDetailScreen
                    question={activeQuestion}
                    updateQuestion={updateQuestion}
                />
            ) : activeQuestion.type === "matching" ? (
                <OsmMatchingQuestionDetailScreen
                    question={activeQuestion}
                    updateQuestion={updateQuestion}
                />
            ) : (
                <>
                    <Text style={styles.emptyDetail}>
                        This question type is not implemented yet.
                    </Text>
                </>
            )}
        </SheetScrollView>
    );
}

type QuestionActionsMenuProps = {
    onNavigate: (route: SheetRouteName) => void;
};

export function QuestionActionsMenu({ onNavigate }: QuestionActionsMenuProps) {
    const { activeQuestion } = useQuestionDerived();
    const { isPinLocked } = useQuestionState();
    const { deleteQuestion, setPinLocked, updateQuestion } =
        useQuestionActions();
    const [isVisible, setVisible] = useState(false);

    if (!activeQuestion || !("center" in activeQuestion)) {
        return null;
    }

    const closeMenu = () => setVisible(false);

    const handleSetToMyLocation = async () => {
        closeMenu();
        const result = await requestUserCoordinate();
        const coordinate = result.coordinate;
        if (coordinate) {
            updateQuestion(activeQuestion.id, (current) =>
                updateQuestionCenter(current, coordinate),
            );
        }
    };

    const handleLockToggle = () => {
        setPinLocked(!isPinLocked);
        closeMenu();
    };

    const handleDeleteQuestion = () => {
        closeMenu();
        deleteQuestion(activeQuestion.id);
        onNavigate("questions");
    };

    return (
        <>
            <Pressable
                accessibilityLabel="Open question actions"
                accessibilityRole="button"
                onPress={() => setVisible(true)}
                style={({ pressed }) => [
                    styles.menuButton,
                    pressed ? styles.actionPressed : null,
                ]}
                testID="question-actions-menu-button"
            >
                <Text style={styles.menuButtonText}>...</Text>
            </Pressable>
            <Modal
                animationType="fade"
                onRequestClose={closeMenu}
                transparent
                visible={isVisible}
            >
                <View style={styles.modalRoot}>
                    <Pressable
                        accessibilityLabel="Close question actions"
                        onPress={closeMenu}
                        style={StyleSheet.absoluteFill}
                    />
                    <View
                        accessibilityViewIsModal
                        accessible
                        accessibilityLabel="Question actions"
                        style={styles.actionSheet}
                        testID="question-actions-menu"
                    >
                        <ActionSheetButton
                            accessibilityLabel="Set question pin to my location"
                            onPress={() => {
                                void handleSetToMyLocation();
                            }}
                            testID="question-actions-set-location"
                            title="Set pin to my location"
                        />
                        <ActionSheetButton
                            accessibilityLabel={
                                isPinLocked
                                    ? "Unlock question pin"
                                    : "Lock question pin"
                            }
                            accessibilityState={{ selected: isPinLocked }}
                            onPress={handleLockToggle}
                            testID="question-actions-lock-toggle"
                            title={isPinLocked ? "Unlock pin" : "Lock pin"}
                        />
                        <ActionSheetButton
                            destructive
                            accessibilityLabel="Delete question"
                            onPress={handleDeleteQuestion}
                            testID="question-actions-delete"
                            title="Delete question"
                        />
                        <ActionSheetButton
                            onPress={closeMenu}
                            testID="question-actions-cancel"
                            title="Cancel"
                        />
                    </View>
                </View>
            </Modal>
        </>
    );
}

function ActionSheetButton({
    accessibilityLabel,
    accessibilityState,
    destructive = false,
    onPress,
    testID,
    title,
}: {
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean };
    destructive?: boolean;
    onPress: () => void;
    testID: string;
    title: string;
}) {
    return (
        <Pressable
            accessibilityLabel={accessibilityLabel ?? title}
            accessibilityRole="button"
            accessibilityState={accessibilityState}
            onPress={onPress}
            style={({ pressed }) => [
                styles.actionSheetButton,
                destructive ? styles.actionSheetButtonDestructive : null,
                pressed ? styles.actionPressed : null,
            ]}
            testID={testID}
        >
            <Text
                style={[
                    styles.actionSheetButtonText,
                    destructive
                        ? styles.actionSheetButtonTextDestructive
                        : null,
                ]}
            >
                {title}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    actionSheet: {
        backgroundColor: colors.panel,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        gap: 8,
        padding: 20,
        paddingBottom: 34,
    },
    actionSheetButton: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 52,
        paddingHorizontal: 16,
    },
    actionSheetButtonDestructive: {
        borderColor: "#f4b4ae",
    },
    actionSheetButtonText: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "800",
    },
    actionSheetButtonTextDestructive: {
        color: "#b42318",
    },
    container: {},
    emptyDetail: {
        color: colors.muted,
        fontSize: 15,
        lineHeight: 21,
        marginTop: 4,
    },
    emptyTitle: {
        color: colors.ink,
        fontSize: 18,
        fontWeight: "800",
    },
    menuButton: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 42,
        minWidth: 44,
        paddingHorizontal: 10,
    },
    menuButtonText: {
        color: colors.ink,
        fontSize: 20,
        fontWeight: "800",
        lineHeight: 20,
        marginTop: -6,
    },
    modalRoot: {
        backgroundColor: "rgba(17, 24, 39, 0.42)",
        flex: 1,
        justifyContent: "flex-end",
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 0,
    },
});
