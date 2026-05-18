import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import { ShareSetupModal } from "@/sharing/export/ShareSetupModal";
import { useHidingZone } from "@/state/hidingZoneStore";
import { usePlayArea } from "@/state/playAreaStore";
import { useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

type SettingsScreenProps = {
    onNavigate: (route: SheetRouteName) => void;
};

export function SettingsScreen({ onNavigate }: SettingsScreenProps) {
    const { cacheSource, playArea } = usePlayArea();
    const { radiusMeters, radiusUnit, selectedPresetIds } = useHidingZone();
    const { questions } = useQuestion();
    const [isShareVisible, setIsShareVisible] = useState(false);

    return (
        <View style={styles.container}>
            <Text style={styles.eyebrow}>Settings</Text>
            <View style={styles.titleRow}>
                <Text style={styles.title}>Game Settings</Text>
                <Pressable
                    accessibilityLabel="Share game setup"
                    accessibilityRole="button"
                    onPress={() => setIsShareVisible(true)}
                    style={({ pressed }) => [
                        styles.shareButton,
                        pressed ? styles.actionPressed : null,
                    ]}
                    testID="settings-share-button"
                >
                    <Text style={styles.shareButtonText}>Share</Text>
                </Pressable>
            </View>
            <Text style={styles.detail}>
                Adjust the map area and app preferences.
            </Text>

            <View style={styles.actions}>
                <Pressable
                    accessibilityLabel="Open Play Area settings"
                    accessibilityRole="button"
                    onPress={() => onNavigate("play-area")}
                    style={({ pressed }) => [
                        styles.action,
                        pressed ? styles.actionPressed : null,
                    ]}
                    testID="settings-play-area-row"
                >
                    <View style={styles.actionCopy}>
                        <Text style={styles.actionTitle}>Play Area</Text>
                        <Text style={styles.actionDescription}>
                            {playArea.label} · {cacheSource}
                        </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                </Pressable>

                <Pressable
                    accessibilityLabel="Open Hiding Zones settings"
                    accessibilityRole="button"
                    onPress={() => onNavigate("hiding-zone")}
                    style={({ pressed }) => [
                        styles.action,
                        pressed ? styles.actionPressed : null,
                    ]}
                    testID="settings-hiding-zone-row"
                >
                    <View style={styles.actionCopy}>
                        <Text style={styles.actionTitle}>Hiding Zones</Text>
                        <Text style={styles.actionDescription}>
                            Eligible transit stations for the hiding zone.
                        </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                </Pressable>
            </View>
            <ShareSetupModal
                hidingZones={{
                    radiusMeters,
                    radiusUnit,
                    selectedPresetIds,
                }}
                onClose={() => setIsShareVisible(false)}
                playArea={playArea}
                questions={questions}
                visible={isShareVisible}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    action: {
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
    actionCopy: {
        flex: 1,
    },
    actionDescription: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 2,
    },
    actionPressed: {
        opacity: 0.72,
    },
    actions: {
        gap: 10,
        marginTop: 18,
    },
    actionTitle: {
        color: colors.ink,
        fontSize: 17,
        fontWeight: "700",
    },
    chevron: {
        color: colors.muted,
        fontSize: 28,
        lineHeight: 28,
    },
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 6,
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
    title: {
        flex: 1,
        color: colors.ink,
        fontSize: 28,
        fontWeight: "800",
    },
    shareButton: {
        backgroundColor: colors.button,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    shareButtonText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: "800",
    },
    titleRow: {
        alignItems: "center",
        flexDirection: "row",
        gap: 12,
        marginTop: 4,
    },
});
