import { Pressable, StyleSheet, Text, View } from "react-native";

import { getQuestionAnswerLabel } from "@/features/questions/questionRegistry";
import type {
    QuestionAnswer,
    QuestionType,
} from "@/features/questions/questionTypes";
import { colors } from "@/theme/colors";

const answers: QuestionAnswer[] = ["unanswered", "positive", "negative"];

type QuestionAnswerSelectorProps = {
    answer: QuestionAnswer;
    onChange: (answer: QuestionAnswer) => void;
    questionType: QuestionType;
    testIDPrefix: string;
};

export function QuestionAnswerSelector({
    answer,
    onChange,
    questionType,
    testIDPrefix,
}: QuestionAnswerSelectorProps) {
    return (
        <View style={styles.segmentedControl}>
            {answers.map((option) => {
                const isActive = answer === option;
                const label = getQuestionAnswerLabel(questionType, option);

                return (
                    <Pressable
                        accessibilityLabel={`${label} answer`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        key={option}
                        onPress={() => onChange(option)}
                        style={({ pressed }) => [
                            styles.answerButton,
                            isActive ? styles.answerButtonActive : null,
                            pressed ? styles.actionPressed : null,
                        ]}
                        testID={`${testIDPrefix}-${option}`}
                    >
                        <Text
                            style={[
                                styles.answerButtonText,
                                isActive ? styles.answerButtonTextActive : null,
                            ]}
                        >
                            {label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    answerButton: {
        alignItems: "center",
        borderRadius: 7,
        flex: 1,
        justifyContent: "center",
        minHeight: 42,
        paddingHorizontal: 10,
    },
    answerButtonActive: {
        backgroundColor: colors.button,
    },
    answerButtonText: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "800",
    },
    answerButtonTextActive: {
        color: colors.white,
    },
    segmentedControl: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 4,
        marginTop: 10,
        padding: 4,
    },
});
