import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

type SheetListRowProps = {
    accessibilityLabel?: string;
    description?: string;
    destructive?: boolean;
    onPress: () => void;
    testID?: string;
    title: string;
    trailing?: ReactNode;
};

export function SheetListRow({
    accessibilityLabel,
    description,
    destructive = false,
    onPress,
    testID,
    title,
    trailing,
}: SheetListRowProps) {
    return (
        <Pressable
            accessible
            accessibilityLabel={accessibilityLabel ?? title}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.row,
                destructive ? styles.rowDestructive : null,
                pressed ? styles.rowPressed : null,
            ]}
            testID={testID}
        >
            <View style={styles.copy}>
                <Text
                    style={[
                        styles.title,
                        destructive ? styles.titleDestructive : null,
                    ]}
                >
                    {title}
                </Text>
                {description ? (
                    <Text style={styles.description}>{description}</Text>
                ) : null}
            </View>
            {trailing ?? <Text style={styles.chevron}>›</Text>}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    chevron: {
        color: colors.muted,
        fontSize: 28,
        lineHeight: 28,
    },
    copy: {
        flex: 1,
    },
    description: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 2,
    },
    row: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        justifyContent: "space-between",
        minHeight: 72,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    rowDestructive: {
        borderColor: "#f4b4ae",
    },
    rowPressed: {
        opacity: 0.72,
    },
    title: {
        color: colors.ink,
        fontSize: 17,
        fontWeight: "700",
    },
    titleDestructive: {
        color: "#b42318",
    },
});
