import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

type FabButtonProps = {
    onPress: () => void;
    visible: boolean;
};

const DOT_SIZE = 8;
const DOT_GAP = 4;

export function FabButton({ onPress, visible }: FabButtonProps) {
    const insets = useSafeAreaInsets();

    return (
        <Pressable
            accessibilityLabel="Open bottom sheet"
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.fab,
                { bottom: insets.bottom + 24 },
                pressed ? styles.fabPressed : null,
            ]}
        >
            <View style={styles.dotRow}>
                <View style={styles.dot} />
                <View style={styles.dot} />
                <View style={styles.dot} />
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    dot: {
        backgroundColor: colors.ink,
        borderRadius: DOT_SIZE / 2,
        height: DOT_SIZE,
        width: DOT_SIZE,
    },
    dotRow: {
        flexDirection: "row",
        gap: DOT_GAP,
    },
    fab: {
        alignItems: "center",
        backgroundColor: colors.white,
        borderColor: "rgba(23, 32, 42, 0.14)",
        borderRadius: 28,
        borderWidth: 1,
        elevation: 5,
        height: 56,
        justifyContent: "center",
        position: "absolute",
        right: 16,
        shadowColor: "#000",
        shadowOffset: { height: 4, width: 0 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
        width: 56,
    },
    fabPressed: {
        opacity: 0.72,
    },
});
