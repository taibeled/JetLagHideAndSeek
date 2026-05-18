import { Pressable, StyleSheet, Text, View } from "react-native";

import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import { useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

type QuestionsScreenProps = {
    onNavigate: (route: SheetRouteName) => void;
};

export function QuestionsScreen({ onNavigate }: QuestionsScreenProps) {
    const { questions, setActiveQuestionId } = useQuestion();

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
                        <Pressable
                            accessibilityLabel={`Open radius question ${index + 1}`}
                            accessibilityRole="button"
                            key={question.id}
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
                                    {Math.round(question.radiusMeters)} m radius
                                </Text>
                            </View>
                            <Text style={styles.chevron}>›</Text>
                        </Pressable>
                    ))}
                </View>
            )}
        </SheetScrollView>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
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
