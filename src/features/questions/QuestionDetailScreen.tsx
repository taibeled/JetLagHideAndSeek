import { Pressable, StyleSheet, Text } from "react-native";

import { getQuestionDefinition } from "@/features/questions/questionRegistry";
import { RadarQuestionDetailScreen } from "@/features/questions/radar/RadarQuestionDetailScreen";
import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import { useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

type QuestionDetailScreenProps = {
    onNavigate: (route: SheetRouteName) => void;
    sheetIndex: number;
};

export function QuestionDetailScreen({
    onNavigate,
    sheetIndex,
}: QuestionDetailScreenProps) {
    const { activeQuestion, deleteQuestion, updateQuestion } = useQuestion();

    if (!activeQuestion) {
        return (
            <SheetScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.eyebrow}>Question</Text>
                <Text style={styles.title}>No Question Selected</Text>
                <Text style={styles.detail}>
                    Return to the question list and choose a question.
                </Text>
            </SheetScrollView>
        );
    }

    const definition = getQuestionDefinition(activeQuestion.type);
    const handleDeleteQuestion = () => {
        deleteQuestion(activeQuestion.id);
        onNavigate("questions");
    };

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
            ) : (
                <>
                    <Text style={styles.eyebrow}>{definition.listTitle}</Text>
                    <Text style={styles.detail}>
                        This question type is not implemented yet.
                    </Text>
                </>
            )}

            <Pressable
                accessibilityLabel="Delete question"
                accessibilityRole="button"
                onPress={handleDeleteQuestion}
                style={({ pressed }) => [
                    styles.deleteButton,
                    pressed ? styles.actionPressed : null,
                ]}
                testID="question-detail-delete-button"
            >
                <Text style={styles.deleteButtonText}>Delete Question</Text>
            </Pressable>
        </SheetScrollView>
    );
}

export function QuestionPinLockButton() {
    const { activeQuestion, isPinLocked, setPinLocked } = useQuestion();

    if (!activeQuestion || activeQuestion.type !== "radar") {
        return null;
    }

    const pinLockLabel = isPinLocked ? "🔒" : "🔓";

    return (
        <Pressable
            accessibilityLabel={
                isPinLocked ? "Unlock radar pin" : "Lock radar pin"
            }
            accessibilityRole="button"
            accessibilityState={{ selected: isPinLocked }}
            onPress={() => setPinLocked(!isPinLocked)}
            style={({ pressed }) => [
                styles.lockButton,
                isPinLocked ? styles.lockButtonActive : null,
                pressed ? styles.actionPressed : null,
            ]}
            testID="radar-pin-lock-button"
        >
            <Text
                style={[
                    styles.lockButtonText,
                    isPinLocked ? styles.lockButtonTextActive : null,
                ]}
            >
                {pinLockLabel}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    container: {},
    deleteButton: {
        alignItems: "center",
        backgroundColor: "#d92d20",
        borderRadius: 8,
        justifyContent: "center",
        marginTop: 18,
        minHeight: 50,
        paddingHorizontal: 16,
    },
    deleteButtonText: {
        color: colors.white,
        fontSize: 16,
        fontWeight: "800",
    },
    detail: {
        color: colors.muted,
        fontSize: 15,
        lineHeight: 21,
        marginTop: 6,
    },
    eyebrow: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    lockButton: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 42,
        minWidth: 94,
        paddingHorizontal: 12,
    },
    lockButtonActive: {
        backgroundColor: colors.button,
        borderColor: colors.button,
    },
    lockButtonText: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "800",
    },
    lockButtonTextActive: {
        color: colors.white,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 6,
    },
    title: {
        color: colors.ink,
        fontSize: 28,
        fontWeight: "800",
        marginTop: 4,
    },
});
