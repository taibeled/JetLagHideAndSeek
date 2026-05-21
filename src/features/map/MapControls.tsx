import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

type MapControlsProps = {
    fitPlayArea: () => void;
    locateUser: () => void;
    topInset: number;
};

export function MapControls({
    fitPlayArea,
    locateUser,
    topInset,
}: MapControlsProps) {
    return (
        <View
            style={[
                styles.controls,
                {
                    top: topInset + 60,
                },
            ]}
        >
            <MapControl label="🗺️" onPress={fitPlayArea} />
            <MapControl label="📍" onPress={locateUser} />
        </View>
    );
}

type MapControlProps = {
    label: string;
    onPress: () => void;
};

function MapControl({ label, onPress }: MapControlProps) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.controlButton,
                pressed ? styles.controlButtonPressed : null,
            ]}
        >
            <Text style={styles.controlLabel}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    controlButton: {
        alignItems: "center",
        backgroundColor: colors.white,
        borderColor: "rgba(23, 32, 42, 0.14)",
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 44,
        paddingHorizontal: 12,
        ...Platform.select({
            default: {
                elevation: 5,
                shadowColor: "#000",
                shadowOffset: { height: 4, width: 0 },
                shadowOpacity: 0.14,
                shadowRadius: 10,
            },
            web: {
                boxShadow: "0 4px 10px rgba(0, 0, 0, 0.14)",
            },
        }),
    },
    controlButtonPressed: {
        opacity: 0.72,
    },
    controlLabel: {
        color: colors.ink,
        fontSize: 20,
        fontWeight: "800",
    },
    controls: {
        gap: 8,
        position: "absolute",
        right: 16,
    },
});
