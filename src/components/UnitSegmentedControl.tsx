import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DistanceUnit } from "@/shared/distanceUnits";
import { colors } from "@/theme/colors";

const units: DistanceUnit[] = ["m", "km", "mi"];

type UnitSegmentedControlProps = {
    onChange: (unit: DistanceUnit) => void;
    testIDPrefix: string;
    value: DistanceUnit;
};

export function UnitSegmentedControl({
    onChange,
    testIDPrefix,
    value,
}: UnitSegmentedControlProps) {
    return (
        <View style={styles.segmentedControl}>
            {units.map((unit) => {
                const isSelected = value === unit;
                return (
                    <Pressable
                        accessibilityLabel={`${unit} distance unit`}
                        accessibilityRole="button"
                        key={unit}
                        onPress={() => onChange(unit)}
                        style={({ pressed }) => [
                            styles.unitButton,
                            isSelected ? styles.unitButtonActive : null,
                            pressed ? styles.actionPressed : null,
                        ]}
                        testID={`${testIDPrefix}-${unit}`}
                    >
                        <Text
                            style={[
                                styles.unitButtonText,
                                isSelected ? styles.unitButtonTextActive : null,
                            ]}
                        >
                            {unit}
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
