import { Pressable, StyleSheet, Text, View } from "react-native";

import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import { usePlayArea } from "@/state/playAreaStore";
import { useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

type MatchingQuestionScreenProps = {
    onNavigate: (route: SheetRouteName) => void;
};

export function MatchingQuestionScreen({
    onNavigate,
}: MatchingQuestionScreenProps) {
    const { playArea } = usePlayArea();
    const { createQuestion } = useQuestion();

    const addTransitLineQuestion = () => {
        createQuestion("matching", {
            center: playArea.center,
        });
        onNavigate("question-detail");
    };

    return (
        <SheetScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.eyebrow}>Matching</Text>
            <Text style={styles.title}>Choose a match</Text>
            <Text style={styles.detail}>
                Ask whether the hider matches one of the nearby candidates.
            </Text>

            <Pressable
                accessibilityLabel="Add transit line question"
                accessibilityRole="button"
                onPress={addTransitLineQuestion}
                style={({ pressed }) => [
                    styles.optionRow,
                    pressed ? styles.actionPressed : null,
                ]}
                testID="add-transit-line-question-row"
            >
                <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>Transit Line</Text>
                    <Text style={styles.metadata}>
                        Ask if the hider is on a specific transit line.
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
    eyebrow: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    metadata: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 2,
    },
    optionCopy: {
        flex: 1,
    },
    optionRow: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        justifyContent: "space-between",
        marginTop: 22,
        minHeight: 68,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    optionTitle: {
        color: colors.ink,
        fontSize: 18,
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
