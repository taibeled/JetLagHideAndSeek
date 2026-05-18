import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { HidingZoneUnit } from "@/features/hidingZone/hidingZoneTypes";
import {
    findNearestStation,
    formatStationDistance,
} from "@/features/questions/questionGeometry";
import {
    type RadiusOption,
    radiusPresetOptions,
} from "@/features/questions/questionTypes";
import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import { useHidingZone } from "@/state/hidingZoneStore";
import { getRadiusDisplayValue, useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

const units: HidingZoneUnit[] = ["m", "km", "mi"];
const allRadiusOptions: RadiusOption[] = [...radiusPresetOptions, "other"];

export function QuestionDetailScreen() {
    const {
        activeQuestion,
        isMovePinEnabled,
        setMovePinEnabled,
        setRadiusOption,
        setRadiusUnit,
        setRadiusValue,
    } = useQuestion();
    const { selectedStations } = useHidingZone();

    if (!activeQuestion) {
        return (
            <SheetScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.eyebrow}>Question</Text>
                <Text style={styles.title}>No Question Selected</Text>
                <Text style={styles.detail}>
                    Return to the question list and choose a radius question.
                </Text>
            </SheetScrollView>
        );
    }

    const nearest = findNearestStation(activeQuestion.center, selectedStations);
    const customValue = getRadiusDisplayValue(activeQuestion);

    return (
        <SheetScrollView
            contentContainerStyle={styles.scrollContent}
            style={styles.container}
        >
            <Text style={styles.eyebrow}>Radius Question</Text>
            <Text style={styles.title}>Preview Radius</Text>
            <Text style={styles.detail}>
                Move the pin and compare a radius against the current map setup.
            </Text>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Radius</Text>
                <View style={styles.optionGrid}>
                    {allRadiusOptions.map((option) => (
                        <Pressable
                            accessibilityLabel={`Radius ${getOptionLabel(option)}`}
                            accessibilityRole="button"
                            key={option}
                            onPress={() =>
                                setRadiusOption(activeQuestion.id, option)
                            }
                            style={({ pressed }) => [
                                styles.radiusOption,
                                activeQuestion.radiusOption === option
                                    ? styles.radiusOptionActive
                                    : null,
                                pressed ? styles.actionPressed : null,
                            ]}
                            testID={`radius-option-${option}`}
                        >
                            <Text
                                style={[
                                    styles.radiusOptionText,
                                    activeQuestion.radiusOption === option
                                        ? styles.radiusOptionTextActive
                                        : null,
                                ]}
                            >
                                {getOptionLabel(option)}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {activeQuestion.radiusOption === "other" ? (
                    <View style={styles.customRadiusRow}>
                        <TextInput
                            accessibilityLabel="Custom radius"
                            keyboardType="decimal-pad"
                            onChangeText={(value) =>
                                setRadiusValue(activeQuestion.id, value)
                            }
                            style={styles.customRadiusInput}
                            testID="radius-custom-input"
                            value={customValue}
                        />
                        <View style={styles.segmentedControl}>
                            {units.map((unit) => (
                                <Pressable
                                    accessibilityRole="button"
                                    key={unit}
                                    onPress={() =>
                                        setRadiusUnit(activeQuestion.id, unit)
                                    }
                                    style={({ pressed }) => [
                                        styles.unitButton,
                                        activeQuestion.radiusUnit === unit
                                            ? styles.unitButtonActive
                                            : null,
                                        pressed ? styles.actionPressed : null,
                                    ]}
                                    testID={`radius-unit-${unit}`}
                                >
                                    <Text
                                        style={[
                                            styles.unitButtonText,
                                            activeQuestion.radiusUnit === unit
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
                ) : null}

                <Text style={styles.metadata} testID="radius-meters">
                    Stored as {Math.round(activeQuestion.radiusMeters)} m
                </Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pin</Text>
                <Pressable
                    accessibilityLabel={
                        isMovePinEnabled
                            ? "Stop moving radius pin"
                            : "Move radius pin"
                    }
                    accessibilityRole="button"
                    onPress={() => setMovePinEnabled(!isMovePinEnabled)}
                    style={({ pressed }) => [
                        styles.movePinButton,
                        isMovePinEnabled ? styles.movePinButtonActive : null,
                        pressed ? styles.actionPressed : null,
                    ]}
                    testID="radius-move-pin-button"
                >
                    <Text
                        style={[
                            styles.movePinButtonText,
                            isMovePinEnabled
                                ? styles.movePinButtonTextActive
                                : null,
                        ]}
                    >
                        {isMovePinEnabled ? "Moving Pin" : "Move Pin"}
                    </Text>
                </Pressable>
                <Text style={styles.metadata} testID="radius-center-summary">
                    {activeQuestion.center[1].toFixed(5)},{" "}
                    {activeQuestion.center[0].toFixed(5)}
                </Text>
            </View>

            <View
                accessible
                accessibilityLabel={getInfoText(nearest)}
                style={styles.infoBox}
                testID="radius-info-box"
            >
                <Text style={styles.infoLabel}>Info</Text>
                <Text style={styles.infoText}>{getInfoText(nearest)}</Text>
            </View>
        </SheetScrollView>
    );
}

function getOptionLabel(option: RadiusOption) {
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
    customRadiusInput: {
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
    customRadiusRow: {
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
    movePinButton: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 48,
        paddingHorizontal: 16,
    },
    movePinButtonActive: {
        backgroundColor: colors.button,
        borderColor: colors.button,
    },
    movePinButtonText: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "800",
    },
    movePinButtonTextActive: {
        color: colors.white,
    },
    optionGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    radiusOption: {
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
    radiusOptionActive: {
        backgroundColor: colors.button,
        borderColor: colors.button,
    },
    radiusOptionText: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "800",
    },
    radiusOptionTextActive: {
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
