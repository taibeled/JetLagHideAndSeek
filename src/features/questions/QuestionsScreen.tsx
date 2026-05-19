import { Pressable, StyleSheet, Text, View } from "react-native";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import { useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

type QuestionsScreenProps = {
    onNavigate: (route: SheetRouteName) => void;
};

export function QuestionsScreen({ onNavigate }: QuestionsScreenProps) {
    const { deleteQuestion, questions, setActiveQuestionId } = useQuestion();

    const openQuestion = (questionId: string) => {
        setActiveQuestionId(questionId);
        onNavigate("question-detail");
    };

    return (
        <SheetScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.eyebrow}>Questions</Text>
            <Text style={styles.title}>Question List</Text>
            <Text style={styles.detail}>
                Review radius previews and reopen their map pins.
            </Text>

            {questions.length === 0 ? (
                <View style={styles.emptyCard} testID="questions-empty-card">
                    <Text style={styles.emptyTitle}>No questions yet</Text>
                    <Text style={styles.metadata}>
                        Add a radius question to preview an area on the map.
                    </Text>
                </View>
            ) : (
                <View style={styles.list}>
                    {questions.map((question, index) => (
                        <Swipeable
                            key={question.id}
                            overshootRight={false}
                            renderRightActions={() => (
                                <View style={styles.deleteActionWrapper}>
                                    <Pressable
                                        accessibilityLabel={`Delete radius question ${index + 1}`}
                                        accessibilityRole="button"
                                        onPress={() =>
                                            deleteQuestion(question.id)
                                        }
                                        style={({ pressed }) => [
                                            styles.deleteAction,
                                            pressed
                                                ? styles.actionPressed
                                                : null,
                                        ]}
                                        testID={`question-delete-${question.id}`}
                                    >
                                        <Text style={styles.deleteActionText}>
                                            Delete
                                        </Text>
                                    </Pressable>
                                </View>
                            )}
                        >
                            <Pressable
                                accessibilityLabel={`Open radius question ${index + 1}`}
                                accessibilityRole="button"
                                onPress={() => openQuestion(question.id)}
                                style={({ pressed }) => [
                                    styles.questionRow,
                                    pressed ? styles.actionPressed : null,
                                ]}
                                testID={`question-row-${question.id}`}
                            >
                                <View style={styles.questionCopy}>
                                    <Text style={styles.questionTitle}>
                                        Radius Question {index + 1}
                                    </Text>
                                    <Text style={styles.metadata}>
                                        {Math.round(question.radiusMeters)} m
                                        radius
                                    </Text>
                                </View>
                                <Text style={styles.chevron}>›</Text>
                            </Pressable>
                        </Swipeable>
                    ))}
                </View>
            )}

            <Pressable
                accessibilityLabel="Add question"
                accessibilityRole="button"
                onPress={() => onNavigate("add-question")}
                style={({ pressed }) => [
                    styles.addQuestionRow,
                    pressed ? styles.actionPressed : null,
                ]}
                testID="questions-add-question-row"
            >
                <View style={styles.questionCopy}>
                    <Text style={styles.questionTitle}>Add Question</Text>
                    <Text style={styles.metadata}>
                        Start a radius, thermometer, or transit question.
                    </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
            </Pressable>
        </SheetScrollView>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    addQuestionRow: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        justifyContent: "space-between",
        marginTop: 16,
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    chevron: {
        color: colors.muted,
        fontSize: 28,
        lineHeight: 28,
    },
    detail: {
        color: colors.muted,
        fontSize: 15,
        lineHeight: 21,
        marginTop: 6,
    },
    deleteAction: {
        alignItems: "center",
        backgroundColor: "#d92d20",
        justifyContent: "center",
        minHeight: 64,
        paddingHorizontal: 20,
    },
    deleteActionText: {
        color: colors.white,
        fontSize: 15,
        fontWeight: "800",
    },
    deleteActionWrapper: {
        borderRadius: 8,
        marginLeft: 8,
        overflow: "hidden",
    },
    emptyCard: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
        marginTop: 22,
        padding: 16,
    },
    emptyTitle: {
        color: colors.ink,
        fontSize: 18,
        fontWeight: "800",
    },
    eyebrow: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    list: {
        gap: 10,
        marginTop: 22,
    },
    metadata: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 2,
    },
    questionCopy: {
        flex: 1,
    },
    questionRow: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        justifyContent: "space-between",
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    questionTitle: {
        color: colors.ink,
        fontSize: 17,
        fontWeight: "800",
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
