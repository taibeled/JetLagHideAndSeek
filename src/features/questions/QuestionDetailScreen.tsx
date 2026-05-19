import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { HidingZoneUnit } from "@/features/hidingZone/hidingZoneTypes";
import { getQuestionDefinition } from "@/features/questions/questionCatalog";
import {
    findNearestStation,
    formatStationDistance,
} from "@/features/questions/questionGeometry";
import { requestUserCoordinate } from "@/features/map/useUserLocation";
import {
    type RadarDistanceOption,
    type RadarQuestion,
    radarDistancePresetOptions,
} from "@/features/questions/questionTypes";
import { useRadarDistanceDraftInput } from "@/features/questions/useRadarDistanceDraftInput";
import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import { useHidingZone } from "@/state/hidingZoneStore";
import { updateRadarQuestionCenter, useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

const units: HidingZoneUnit[] = ["m", "km", "mi"];
const allDistanceOptions: RadarDistanceOption[] = [
    ...radarDistancePresetOptions,
    "other",
];

type QuestionDetailScreenProps = {
    onNavigate: (route: SheetRouteName) => void;
};

export function QuestionDetailScreen({
    onNavigate,
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

type RadarQuestionDetailScreenProps = {
    question: RadarQuestion;
    updateQuestion: ReturnType<typeof useQuestion>["updateQuestion"];
};

function RadarQuestionDetailScreen({
    question,
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

    return (
        <>
            <Text style={styles.eyebrow}>Radar Question</Text>
            <Text style={styles.detail}>
                Ask whether the hider is within a distance of you.
            </Text>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Distance</Text>
                <View style={styles.optionGrid}>
                    {allDistanceOptions.map((option) => (
                        <Pressable
                            accessibilityLabel={`Radar distance ${getOptionLabel(option)}`}
                            accessibilityRole="button"
                            key={option}
                            onPress={() => handleDistanceOptionPress(option)}
                            style={({ pressed }) => [
                                styles.distanceOption,
                                question.distanceOption === option
                                    ? styles.distanceOptionActive
                                    : null,
                                pressed ? styles.actionPressed : null,
                            ]}
                            testID={`radar-distance-option-${option}`}
                        >
                            <Text
                                style={[
                                    styles.distanceOptionText,
                                    question.distanceOption === option
                                        ? styles.distanceOptionTextActive
                                        : null,
                                ]}
                            >
                                {getOptionLabel(option)}
                            </Text>
                        </Pressable>
                    ))}
                </View>

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

function getOptionLabel(option: RadarDistanceOption) {
    return option === "other" ? "Other" : option;
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
    container: {},
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
    metadata: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 8,
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
    optionGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    pinHelp: {
        color: colors.ink,
        fontSize: 15,
        fontWeight: "700",
        lineHeight: 21,
    },
    distanceOption: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        minHeight: 44,
        minWidth: 72,
        paddingHorizontal: 12,
        justifyContent: "center",
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
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 6,
    },
    section: {
        marginTop: 22,
    },
    sectionTitle: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 10,
    },
    segmentedControl: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        overflow: "hidden",
    },
    title: {
        color: colors.ink,
        fontSize: 28,
        fontWeight: "800",
        marginTop: 4,
    },
    unitButton: {
        alignItems: "center",
        justifyContent: "center",
        minHeight: 46,
        minWidth: 44,
        paddingHorizontal: 10,
    },
    unitButtonActive: {
        backgroundColor: colors.button,
    },
    unitButtonText: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "800",
    },
    unitButtonTextActive: {
        color: colors.white,
    },
});
