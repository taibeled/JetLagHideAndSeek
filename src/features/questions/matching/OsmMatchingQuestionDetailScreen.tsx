import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { QuestionAnswerSelector } from "@/features/questions/components/QuestionAnswerSelector";
import { QuestionLocationSelector } from "@/features/questions/components/QuestionLocationSelector";
import { formatStationDistance } from "@/features/questions/radar/radarGeometry";
import {
    updateQuestionCenter,
    useQuestionActions,
} from "@/state/questionStore";
import { colors } from "@/theme/colors";
import type { MatchingQuestion } from "./matchingTypes";
import { getCategoryTitle } from "./matchingCategories";
import { findMatchingFeatures } from "./osmMatching";

const OVERPASS_ERROR_MESSAGE =
    "Unable to search. Check your connection and try again.";

type OsmMatchingQuestionDetailScreenProps = {
    question: MatchingQuestion;
    updateQuestion: ReturnType<typeof useQuestionActions>["updateQuestion"];
};

function centersEqual(a: [number, number], b: [number, number]): boolean {
    return a[0] === b[0] && a[1] === b[1];
}

export function OsmMatchingQuestionDetailScreen({
    question,
    updateQuestion,
}: OsmMatchingQuestionDetailScreenProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const categoryTitle = getCategoryTitle(question.category);
    const searchGenerationRef = useRef(0);
    const lastSearchCenterRef = useRef<[number, number] | null>(null);

    const performSearch = async () => {
        const generation = ++searchGenerationRef.current;
        lastSearchCenterRef.current = question.center;
        setIsLoading(true);
        setError(null);
        try {
            const candidates = await findMatchingFeatures(
                question.category,
                question.center,
            );
            // Ignore stale responses from earlier searches
            if (generation !== searchGenerationRef.current) {
                return;
            }
            const nearest = candidates[0] ?? null;
            updateQuestion(question.id, (current) => {
                if (current.type !== "matching") return current;
                return {
                    ...current,
                    candidates,
                    selectedOsmId: nearest?.osmId ?? null,
                    selectedOsmType: nearest?.osmType ?? null,
                    targetName: nearest?.name ?? null,
                    targetOsmId: nearest?.osmId ?? null,
                    targetOsmType: nearest?.osmType ?? null,
                    updatedAt: new Date().toISOString(),
                };
            });
        } catch {
            if (generation === searchGenerationRef.current) {
                setError(OVERPASS_ERROR_MESSAGE);
            }
        } finally {
            if (generation === searchGenerationRef.current) {
                setIsLoading(false);
            }
        }
    };

    // Auto-query on mount if no candidates are loaded, and invalidate stale
    // candidates when the question pin moves.
    useEffect(() => {
        const needsSearch =
            question.candidates.length === 0 &&
            (lastSearchCenterRef.current === null ||
                !centersEqual(lastSearchCenterRef.current, question.center));

        if (needsSearch && !isLoading) {
            void performSearch();
        } else if (
            question.candidates.length > 0 &&
            lastSearchCenterRef.current !== null &&
            !centersEqual(lastSearchCenterRef.current, question.center)
        ) {
            // Pin moved since last search: clear derived state so the next
            // effect run will trigger a fresh search for the new center.
            // Intentionally do NOT update lastSearchCenterRef here; the
            // subsequent render with empty candidates must detect a mismatch.
            updateQuestion(question.id, (current) => {
                if (current.type !== "matching") return current;
                return {
                    ...current,
                    candidates: [],
                    selectedOsmId: null,
                    selectedOsmType: null,
                    targetName: null,
                    targetOsmId: null,
                    targetOsmType: null,
                    updatedAt: new Date().toISOString(),
                };
            });
        } else if (
            question.candidates.length > 0 &&
            lastSearchCenterRef.current === null
        ) {
            // Candidates were loaded from persistence/import; record the center
            // so future moves are detected correctly.
            lastSearchCenterRef.current = question.center;
        }
    }, [question.center, question.candidates.length, isLoading]);

    const handleSelectCandidate = (candidate: {
        name: string;
        osmId: number;
        osmType: "node" | "way" | "relation";
    }) => {
        updateQuestion(question.id, (current) => {
            if (current.type !== "matching") return current;
            return {
                ...current,
                selectedOsmId: candidate.osmId,
                selectedOsmType: candidate.osmType,
                targetName: candidate.name,
                targetOsmId: candidate.osmId,
                targetOsmType: candidate.osmType,
                updatedAt: new Date().toISOString(),
            };
        });
    };

    const hasCandidates = question.candidates.length > 0;

    return (
        <>
            <QuestionLocationSelector
                center={question.center}
                onCenterChange={(center) =>
                    updateQuestion(question.id, (current) =>
                        updateQuestionCenter(current, center),
                    )
                }
                setToLocationAccessibilityLabel={`Set ${categoryTitle} pin to my location`}
                showSetToLocationButton={false}
                testIDPrefix="osm-matching"
            />

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{categoryTitle}</Text>

                {hasCandidates ? (
                    <View style={styles.candidateList}>
                        {question.candidates.map((candidate) => {
                            const isSelected =
                                question.selectedOsmId === candidate.osmId &&
                                question.selectedOsmType === candidate.osmType;
                            return (
                                <Pressable
                                    accessibilityLabel={`${candidate.name}${candidate.distanceMeters !== undefined ? `, ${formatStationDistance(candidate.distanceMeters)}` : ""}`}
                                    accessibilityRole="button"
                                    key={`${candidate.osmType}-${candidate.osmId}`}
                                    onPress={() =>
                                        handleSelectCandidate(candidate)
                                    }
                                    style={[
                                        styles.candidateRow,
                                        isSelected
                                            ? styles.candidateRowSelected
                                            : null,
                                    ]}
                                    testID={`osm-matching-candidate-${candidate.osmId}`}
                                >
                                    <View style={styles.candidateCopy}>
                                        <Text
                                            style={styles.candidateName}
                                            numberOfLines={1}
                                        >
                                            {candidate.name}
                                        </Text>
                                    </View>
                                    {candidate.distanceMeters !== undefined ? (
                                        <Text style={styles.candidateDistance}>
                                            {formatStationDistance(
                                                candidate.distanceMeters,
                                            )}
                                        </Text>
                                    ) : null}
                                </Pressable>
                            );
                        })}
                    </View>
                ) : (
                    <Text style={styles.metadata}>
                        {isLoading
                            ? `Searching for nearest ${categoryTitle.toLowerCase()}...`
                            : `No ${categoryTitle.toLowerCase()} found nearby.`}
                    </Text>
                )}

                {error ? (
                    <Text style={styles.errorText} testID="osm-matching-error">
                        {error}
                    </Text>
                ) : null}

                <Pressable
                    accessibilityLabel={`Refresh ${categoryTitle} search`}
                    accessibilityRole="button"
                    disabled={isLoading}
                    onPress={() => {
                        void performSearch();
                    }}
                    style={({ pressed }) => [
                        styles.refreshButton,
                        pressed ? styles.actionPressed : null,
                        isLoading ? styles.refreshButtonDisabled : null,
                    ]}
                    testID="osm-matching-refresh"
                >
                    <Text style={styles.refreshButtonText}>
                        {isLoading ? "Searching..." : "Refresh Search"}
                    </Text>
                </Pressable>
            </View>

            <View style={styles.section}>
                <Text
                    accessibilityLabel="Matching answer section"
                    style={styles.sectionTitle}
                >
                    Answer
                </Text>
                <QuestionAnswerSelector
                    answer={question.answer}
                    disabledAnswers={
                        question.targetName === null
                            ? ["positive", "negative"]
                            : undefined
                    }
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
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    candidateCopy: { flex: 1, marginRight: 8 },
    candidateDistance: {
        color: colors.tint,
        fontSize: 13,
        fontWeight: "800",
    },
    candidateList: { gap: 8, marginTop: 12 },
    candidateName: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "700",
    },
    candidateRow: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        justifyContent: "space-between",
        minHeight: 48,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    candidateRowSelected: {
        backgroundColor: colors.buttonSubtle,
        borderColor: colors.tint,
    },
    errorText: {
        color: "#b42318",
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 18,
        marginTop: 8,
    },
    metadata: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 2,
    },
    refreshButton: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: "center",
        marginTop: 12,
        minHeight: 48,
        paddingHorizontal: 16,
    },
    refreshButtonDisabled: {
        opacity: 0.5,
    },
    refreshButtonText: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "800",
    },
    section: {
        marginTop: 12,
    },
    sectionTitle: {
        color: colors.ink,
        fontSize: 17,
        fontWeight: "800",
    },
});
