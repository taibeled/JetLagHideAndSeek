import { Pressable, StyleSheet, Text, View } from "react-native";

import { QuestionAnswerSelector } from "@/features/questions/components/QuestionAnswerSelector";
import type { TransitLineQuestion } from "@/features/questions/transitLine/transitLineTypes";
import { getTransitLineOptions } from "@/features/questions/transitLine/transitLineQuestion";
import { useHidingZone } from "@/state/hidingZoneStore";
import { useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

export function TransitLineQuestionDetailScreen({
    question,
    updateQuestion,
}: {
    question: TransitLineQuestion;
    updateQuestion: ReturnType<typeof useQuestion>["updateQuestion"];
}) {
    const { selectedRoutes, selectedStations } = useHidingZone();
    const routeNames = new Map(
        selectedRoutes.map((route) => [route.id, route.name]),
    );
    const lineOptions = getTransitLineOptions(selectedStations, routeNames);

    return (
        <>
            <Text style={styles.eyebrow}>Matching Question</Text>
            <Text style={styles.title}>Transit · Transit Line</Text>
            <Text style={styles.detail}>
                Are you on the selected transit line?
            </Text>
            <View style={styles.optionList}>
                {lineOptions.map((line) => {
                    const isSelected = line.id === question.lineId;
                    return (
                        <Pressable
                            key={line.id}
                            onPress={() =>
                                updateQuestion(question.id, (current) =>
                                    current.type === "matching"
                                        ? {
                                              ...current,
                                              lineId: line.id,
                                              lineName: line.name,
                                              updatedAt:
                                                  new Date().toISOString(),
                                          }
                                        : current,
                                )
                            }
                            style={[
                                styles.lineRow,
                                isSelected ? styles.lineRowSelected : null,
                            ]}
                            testID={`transit-line-option-${line.id}`}
                        >
                            <Text style={styles.lineName}>{line.name}</Text>
                            <Text style={styles.meta}>
                                {line.stationCount} stations
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
            <QuestionAnswerSelector
                answer={question.answer}
                onChange={(answer) =>
                    updateQuestion(question.id, (current) =>
                        current.type === "matching"
                            ? {
                                  ...current,
                                  answer,
                                  updatedAt: new Date().toISOString(),
                              }
                            : current,
                    )
                }
                questionType={question.type}
                testIDPrefix="matching-answer-option"
            />
        </>
    );
}

const styles = StyleSheet.create({
    detail: { color: colors.muted, fontSize: 15, lineHeight: 21, marginTop: 6 },
    eyebrow: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        textTransform: "uppercase",
    },
    lineName: { color: colors.ink, fontSize: 16, fontWeight: "700" },
    lineRow: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        backgroundColor: colors.card,
    },
    lineRowSelected: {
        borderColor: colors.tint,
        backgroundColor: colors.buttonSubtle,
    },
    meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
    optionList: { gap: 8, marginTop: 16 },
    title: { color: colors.ink, fontSize: 24, fontWeight: "800", marginTop: 4 },
});
