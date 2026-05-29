import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Position } from "@/features/map/geojsonTypes";
import { requestUserCoordinate } from "@/features/map/useUserLocation";
import { colors } from "@/theme/colors";

type QuestionLocationSelectorProps = {
    buttonLabel?: string;
    center: Position;
    onCenterChange: (center: Position) => void;
    setToLocationAccessibilityLabel: string;
    testIDPrefix: string;
};

export function QuestionLocationSelector({
    buttonLabel = "Set to My Location",
    center,
    onCenterChange,
    setToLocationAccessibilityLabel,
    testIDPrefix,
}: QuestionLocationSelectorProps) {
    const handleSetToMyLocation = async () => {
        const result = await requestUserCoordinate();
        if (result.coordinate) {
            onCenterChange(result.coordinate);
        }
    };

    return (
        <View style={styles.section}>
            <Text
                style={styles.metadata}
                testID={`${testIDPrefix}-center-summary`}
            >
                {center[1].toFixed(5)}
                {","} {center[0].toFixed(5)}
            </Text>
            <Pressable
                accessibilityLabel={setToLocationAccessibilityLabel}
                accessibilityRole="button"
                onPress={() => {
                    void handleSetToMyLocation();
                }}
                style={({ pressed }) => [
                    styles.locationButton,
                    pressed ? styles.actionPressed : null,
                ]}
                testID={`${testIDPrefix}-set-to-location-button`}
            >
                <Text style={styles.locationButtonText}>{buttonLabel}</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
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
    section: {
        marginTop: 22,
    },
});
