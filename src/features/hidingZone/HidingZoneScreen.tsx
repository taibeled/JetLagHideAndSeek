import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { UnitSegmentedControl } from "@/components/UnitSegmentedControl";
import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import { useHidingZone } from "@/state/hidingZoneStore";
import { colors } from "@/theme/colors";

import type { HidingZonePreset } from "./hidingZoneTypes";

export function HidingZoneScreen() {
    const {
        presets,
        radiusDisplayValue,
        radiusMeters,
        radiusUnit,
        selectedPresetIds,
        selectedStations,
        setRadiusDisplayValue,
        setRadiusUnit,
        suggestedPresetIds,
        togglePreset,
    } = useHidingZone();
    const suggestedSet = new Set(suggestedPresetIds);
    const selectedSet = new Set(selectedPresetIds);
    const suggestedPresets = presets.filter((preset) =>
        suggestedSet.has(preset.id),
    );
    const otherPresets = presets.filter(
        (preset) => !suggestedSet.has(preset.id),
    );
    const currentAccessibilityLabel = `Hiding zone settings; radius ${radiusDisplayValue} ${radiusUnit}; stored as ${Math.round(radiusMeters)} m; ${selectedPresetIds.length} preset${selectedPresetIds.length === 1 ? "" : "s"} selected; ${selectedStations.length} station${selectedStations.length === 1 ? "" : "s"}`;

    return (
        <SheetScrollView
            style={styles.container}
            contentContainerStyle={styles.scrollContent}
        >
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Station radius</Text>
                <View style={styles.radiusRow}>
                    <TextInput
                        accessibilityLabel="Hiding zone radius"
                        keyboardType="decimal-pad"
                        onChangeText={setRadiusDisplayValue}
                        style={styles.radiusInput}
                        testID="hiding-zone-radius-input"
                        value={radiusDisplayValue}
                    />
                    <UnitSegmentedControl
                        onChange={setRadiusUnit}
                        testIDPrefix="hiding-zone-unit"
                        value={radiusUnit}
                    />
                </View>
                <Text
                    accessibilityLabel={`Stored as ${Math.round(radiusMeters)} m`}
                    style={styles.metadata}
                    testID="hiding-zone-radius-meters"
                >
                    Stored as {Math.round(radiusMeters)} m
                </Text>
            </View>

            <View
                accessible
                accessibilityLabel={currentAccessibilityLabel}
                style={styles.card}
                testID="current-hiding-zone-card"
            >
                <Text style={styles.cardLabel}>Current</Text>
                <Text style={styles.currentName}>
                    {selectedPresetIds.length} preset
                    {selectedPresetIds.length === 1 ? "" : "s"} selected
                </Text>
                <Text style={styles.metadata}>
                    {selectedStations.length} station
                    {selectedStations.length === 1 ? "" : "s"} contribute to the
                    merged zone
                </Text>
            </View>

            <PresetSection
                presets={suggestedPresets}
                selectedSet={selectedSet}
                title="Suggested presets"
                togglePreset={togglePreset}
            />

            {otherPresets.length > 0 ? (
                <PresetSection
                    presets={otherPresets}
                    selectedSet={selectedSet}
                    title="Other presets"
                    togglePreset={togglePreset}
                />
            ) : null}
        </SheetScrollView>
    );
}

function PresetSection({
    presets,
    selectedSet,
    title,
    togglePreset,
}: {
    presets: HidingZonePreset[];
    selectedSet: Set<string>;
    title: string;
    togglePreset: (presetId: string) => void;
}) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {presets.length === 0 ? (
                <Text style={styles.emptyText}>No matching presets.</Text>
            ) : (
                presets.map((preset) => (
                    <PresetRow
                        isSelected={selectedSet.has(preset.id)}
                        key={preset.id}
                        preset={preset}
                        onToggle={() => togglePreset(preset.id)}
                    />
                ))
            )}
        </View>
    );
}

function PresetRow({
    isSelected,
    onToggle,
    preset,
}: {
    isSelected: boolean;
    onToggle: () => void;
    preset: HidingZonePreset;
}) {
    return (
        <Pressable
            accessibilityLabel={`${preset.label}, ${isSelected ? "Remove" : "Add"}`}
            accessibilityRole="button"
            onPress={onToggle}
            style={({ pressed }) => [
                styles.presetRow,
                isSelected ? styles.presetRowSelected : null,
                pressed ? styles.actionPressed : null,
            ]}
            testID={`hiding-zone-preset-${preset.id}`}
        >
            <View style={styles.presetCopy}>
                <Text style={styles.presetTitle}>{preset.label}</Text>
                <Text style={styles.metadata}>
                    {preset.routes.length} line
                    {preset.routes.length === 1 ? "" : "s"} ·{" "}
                    {preset.stations.length} station
                    {preset.stations.length === 1 ? "" : "s"}
                </Text>
            </View>
            <Text
                style={[
                    styles.presetAction,
                    isSelected ? styles.presetActionSelected : null,
                ]}
            >
                {isSelected ? "Remove" : "Add"}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    card: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
        marginTop: 12,
        padding: 14,
    },
    cardLabel: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    container: {},
    currentName: {
        color: colors.ink,
        fontSize: 22,
        fontWeight: "800",
    },
    emptyText: {
        color: colors.muted,
        fontSize: 14,
        lineHeight: 20,
    },
    metadata: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
    },
    presetAction: {
        color: colors.button,
        fontSize: 14,
        fontWeight: "800",
    },
    presetActionSelected: {
        color: colors.tint,
    },
    presetCopy: {
        flex: 1,
    },
    presetRow: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        justifyContent: "space-between",
        marginTop: 8,
        minHeight: 58,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    presetRowSelected: {
        borderColor: colors.tint,
    },
    presetTitle: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "800",
    },
    radiusInput: {
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
    radiusRow: {
        alignItems: "center",
        flexDirection: "row",
        gap: 10,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 0,
    },
    section: {
        marginTop: 12,
    },
    sectionTitle: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 10,
    },
});
