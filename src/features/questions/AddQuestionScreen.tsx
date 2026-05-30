import { Pressable, StyleSheet, Text, View } from "react-native";

import { requestUserCoordinate } from "@/features/map/useUserLocation";
import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import { usePlayArea } from "@/state/playAreaStore";
import { useQuestionActions } from "@/state/questionStore";
import { colors } from "@/theme/colors";

type AddQuestionScreenProps = {
    onNavigate: (route: SheetRouteName) => void;
};

export function AddQuestionScreen({ onNavigate }: AddQuestionScreenProps) {
    const { playArea } = usePlayArea();
    const { createQuestion } = useQuestionActions();

    const addRadarQuestion = async () => {
        const result = await requestUserCoordinate();
        createQuestion("radar", {
            center: result.coordinate ?? playArea.center,
        });
        onNavigate("question-detail");
    };

    return (
        <SheetScrollView contentContainerStyle={styles.scrollContent}>
            <Pressable
                accessibilityLabel="Add radar question"
                accessibilityRole="button"
                onPress={() => {
                    void addRadarQuestion();
                }}
                style={({ pressed }) => [
                    styles.optionRow,
                    pressed ? styles.actionPressed : null,
                ]}
                testID="add-radar-question-row"
            >
                <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>Radar</Text>
                    <Text style={styles.metadata}>
                        Preview a distance from a movable map pin.
                    </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
            </Pressable>

            <Pressable
                accessibilityLabel="Open matching questions"
                accessibilityRole="button"
                onPress={() => onNavigate("matching")}
                style={({ pressed }) => [
                    styles.optionRow,
                    pressed ? styles.actionPressed : null,
                ]}
                testID="add-matching-question-row"
            >
                <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>Matching</Text>
                    <Text style={styles.metadata}>
                        Choose a question that compares nearby candidates.
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
        marginTop: 12,
        minHeight: 58,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    optionTitle: {
        color: colors.ink,
        fontSize: 18,
        fontWeight: "800",
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 0,
    },
});
