import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Animated, {
    FadeIn,
    FadeOut,
    LinearTransition,
} from "react-native-reanimated";

import type { HidingZoneUnit } from "@/features/hidingZone/hidingZoneTypes";
import { requestUserCoordinate } from "@/features/map/useUserLocation";
import { QuestionAnswerSelector } from "@/features/questions/components/QuestionAnswerSelector";
import {
    findNearestStation,
    formatStationDistance,
} from "@/features/questions/radar/radarGeometry";
import {
    type RadarDistanceOption,
    type RadarQuestion,
    radarDistancePresetOptions,
} from "@/features/questions/radar/radarTypes";
import { useRadarDistanceDraftInput } from "@/features/questions/radar/useRadarDistanceDraftInput";
import { SHEET_SNAP_INDEX } from "@/features/sheet/sheetRoutes";
import {
    updateRadarAnswer,
    updateRadarQuestionCenter,
    useQuestion,
} from "@/state/questionStore";
import { useHidingZone } from "@/state/hidingZoneStore";
import { colors } from "@/theme/colors";

const units: HidingZoneUnit[] = ["m", "km", "mi"];
const allDistanceOptions: RadarDistanceOption[] = [
    ...radarDistancePresetOptions,
    "other",
];
const SELECTOR_LAYOUT_TRANSITION = LinearTransition.duration(160);
const SELECTOR_ENTERING = FadeIn.duration(120);
const SELECTOR_EXITING = FadeOut.duration(90);

type RadarQuestionDetailScreenProps = {
    question: RadarQuestion;
    sheetIndex: number;
    updateQuestion: ReturnType<typeof useQuestion>["updateQuestion"];
};

export function RadarQuestionDetailScreen({
    question,
    sheetIndex,
    updateQuestion,
}: RadarQuestionDetailScreenProps) {
    const { selectedStations } = useHidingZone();
    const {
        customDistanceInputRef,
        customDistanceValue,
        emptyDistanceHelpText,
        handleCustomDistanceChange,
        handleDistanceOptionPress,
        handleDistanceUnitPress,
    } = useRadarDistanceDraftInput({
        activeQuestion: question,
        updateQuestion,
    });

    const nearest = findNearestStation(question.center, selectedStations);
    const handleSetToMyLocation = async () => {
        const result = await requestUserCoordinate();
        if (result.coordinate) {
            updateQuestion(question.id, (current) =>
                updateRadarQuestionCenter(current, result.coordinate!),
            );
        }
    };
    const isPreviewSnap = sheetIndex <= SHEET_SNAP_INDEX.medium;

    return (
        <>
            <Text style={styles.eyebrow}>Radar Question</Text>
            <Text style={styles.detail}>
                Ask whether the hider is within a distance of you.
            </Text>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Distance</Text>
                <Animated.View layout={SELECTOR_LAYOUT_TRANSITION}>
                    {isPreviewSnap ? (
                        <Animated.View
                            entering={SELECTOR_ENTERING}
                            exiting={SELECTOR_EXITING}
                            key="distance-carousel"
                        >
                            <ScrollView
                                contentContainerStyle={
                                    styles.optionCarouselContent
                                }
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.optionCarousel}
                                testID="radar-distance-option-carousel"
                            >
                                {allDistanceOptions.map((option) =>
                                    renderDistanceOption({
                                        handleDistanceOptionPress,
                                        option,
                                        selectedOption: question.distanceOption,
                                    }),
                                )}
                            </ScrollView>
                        </Animated.View>
                    ) : (
                        <Animated.View
                            entering={SELECTOR_ENTERING}
                            exiting={SELECTOR_EXITING}
                            key="distance-grid"
                            layout={SELECTOR_LAYOUT_TRANSITION}
                            style={styles.optionGrid}
                            testID="radar-distance-option-grid"
                        >
                            {allDistanceOptions.map((option) =>
                                renderDistanceOption({
                                    handleDistanceOptionPress,
                                    option,
                                    selectedOption: question.distanceOption,
                                }),
                            )}
                        </Animated.View>
                    )}
                </Animated.View>

                {question.distanceOption === "other" ? (
                    <>
                        <View style={styles.customDistanceRow}>
                            <TextInput
                                accessibilityLabel="Custom radar distance"
                                keyboardType="decimal-pad"
                                onChangeText={handleCustomDistanceChange}
                                ref={customDistanceInputRef}
                                style={styles.customDistanceInput}
                                testID="radar-distance-custom-input"
                                value={customDistanceValue}
                            />
                            <View style={styles.segmentedControl}>
                                {units.map((unit) => (
                                    <Pressable
                                        accessibilityRole="button"
                                        key={unit}
                                        onPress={() =>
                                            handleDistanceUnitPress(unit)
                                        }
                                        style={({ pressed }) => [
                                            styles.unitButton,
                                            question.distanceUnit === unit
                                                ? styles.unitButtonActive
                                                : null,
                                            pressed
                                                ? styles.actionPressed
                                                : null,
                                        ]}
                                        testID={`radar-distance-unit-${unit}`}
                                    >
                                        <Text
                                            style={[
                                                styles.unitButtonText,
                                                question.distanceUnit === unit
                                                    ? styles.unitButtonTextActive
                                                    : null,
                                            ]}
                                        >
                                            {unit}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                        {emptyDistanceHelpText ? (
                            <Text
                                style={styles.metadata}
                                testID="radar-distance-custom-empty-help"
                            >
                                {emptyDistanceHelpText}
                            </Text>
                        ) : null}
                    </>
                ) : null}

                <Text style={styles.metadata} testID="radar-distance-meters">
                    Current distance {Math.round(question.distanceMeters)} m
                </Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Answer</Text>
                <QuestionAnswerSelector
                    answer={question.answer}
                    onChange={(answer) =>
                        updateQuestion(question.id, (current) =>
                            current.type === "radar"
                                ? updateRadarAnswer(current, answer)
                                : current,
                        )
                    }
                    questionType={question.type}
                    testIDPrefix="radar-answer-option"
                />
            </View>

            <View style={styles.section}>
                <Text style={styles.metadata} testID="radar-center-summary">
                    {question.center[1].toFixed(5)},{" "}
                    {question.center[0].toFixed(5)}
                </Text>
                <Pressable
                    accessibilityLabel="Set radar pin to my location"
                    accessibilityRole="button"
                    onPress={() => {
                        void handleSetToMyLocation();
                    }}
                    style={({ pressed }) => [
                        styles.locationButton,
                        pressed ? styles.actionPressed : null,
                    ]}
                    testID="radar-set-to-location-button"
                >
                    <Text style={styles.locationButtonText}>
                        Set to My Location
                    </Text>
                </Pressable>
            </View>

            <View
                accessible
                accessibilityLabel={getInfoText(nearest)}
                style={styles.infoBox}
                testID="radar-info-box"
            >
                <Text style={styles.infoLabel}>Info</Text>
                <Text style={styles.infoText}>{getInfoText(nearest)}</Text>
            </View>
        </>
    );
}

function getOptionLabel(option: RadarDistanceOption) {
    return option === "other" ? "Other" : option;
}

type RenderDistanceOptionParams = {
    handleDistanceOptionPress: (option: RadarDistanceOption) => void;
    option: RadarDistanceOption;
    selectedOption: RadarDistanceOption;
};

function renderDistanceOption({
    handleDistanceOptionPress,
    option,
    selectedOption,
}: RenderDistanceOptionParams) {
    const isSelected = selectedOption === option;

    return (
        <Pressable
            accessibilityLabel={`Radar distance ${getOptionLabel(option)}`}
            accessibilityRole="button"
            key={option}
            onPress={() => handleDistanceOptionPress(option)}
            style={({ pressed }) => [
                styles.distanceOption,
                isSelected ? styles.distanceOptionActive : null,
                pressed ? styles.actionPressed : null,
            ]}
            testID={`radar-distance-option-${option}`}
        >
            <Text
                numberOfLines={1}
                style={[
                    styles.distanceOptionText,
                    isSelected ? styles.distanceOptionTextActive : null,
                ]}
            >
                {getOptionLabel(option)}
            </Text>
        </Pressable>
    );
}

function getInfoText(nearest: ReturnType<typeof findNearestStation>): string {
    if (!nearest) {
        return "Select hiding-zone presets to compare against nearby stations.";
    }
    return `${formatStationDistance(nearest.distanceMeters)} from ${nearest.station.name}`;
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    customDistanceInput: {
        backgroundColor: colors.white,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        color: colors.ink,
        flex: 1,
        fontSize: 16,
        minHeight: 48,
        paddingHorizontal: 14,
    },
    customDistanceRow: {
        alignItems: "center",
        flexDirection: "row",
        gap: 10,
        marginTop: 12,
    },
    detail: {
        color: colors.muted,
        fontSize: 15,
        lineHeight: 21,
        marginTop: 6,
    },
    distanceOption: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 42,
        minWidth: 72,
        paddingHorizontal: 8,
    },
    distanceOptionActive: {
        backgroundColor: colors.button,
        borderColor: colors.button,
    },
    distanceOptionText: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "800",
    },
    distanceOptionTextActive: {
        color: colors.white,
    },
    eyebrow: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    infoBox: {
        backgroundColor: "#eaf4f1",
        borderColor: colors.tint,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
        marginTop: 24,
        padding: 16,
    },
    infoLabel: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    infoText: {
        color: colors.ink,
        fontSize: 15,
        fontWeight: "700",
        lineHeight: 21,
    },
    locationButton: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: "center",
        marginTop: 12,
        minHeight: 46,
        paddingHorizontal: 14,
    },
    locationButtonText: {
        color: colors.ink,
        fontSize: 15,
        fontWeight: "800",
    },
    metadata: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 8,
    },
    optionGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 10,
    },
    optionCarousel: {
        marginHorizontal: -20,
        marginTop: 10,
    },
    optionCarouselContent: {
        gap: 8,
        paddingHorizontal: 20,
    },
    section: {
        marginTop: 22,
    },
    sectionTitle: {
        color: colors.ink,
        fontSize: 17,
        fontWeight: "800",
    },
    segmentedControl: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 4,
        padding: 4,
    },
    unitButton: {
        alignItems: "center",
        borderRadius: 7,
        justifyContent: "center",
        minHeight: 38,
        minWidth: 42,
        paddingHorizontal: 8,
    },
    unitButtonActive: {
        backgroundColor: colors.button,
    },
    unitButtonText: {
        color: colors.ink,
        fontSize: 13,
        fontWeight: "800",
    },
    unitButtonTextActive: {
        color: colors.white,
    },
});
