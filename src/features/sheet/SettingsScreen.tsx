import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SheetListRow } from "@/components/SheetListRow";
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
            <Text style={styles.eyebrow} accessibilityLabel="Settings">
                Settings
            </Text>
            <View style={styles.titleRow}>
                <Text style={styles.title} accessibilityLabel="Game Settings">
                    Game Settings
                </Text>
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
                    <Text
                        style={styles.shareButtonText}
                        accessibilityLabel="Share"
                    >
                        Share
                    </Text>
                </Pressable>
            </View>
            <Text
                style={styles.detail}
                accessibilityLabel="Adjust the map area and app preferences."
            >
                Adjust the map area and app preferences.
            </Text>

            <View style={styles.actions}>
                <SheetListRow
                    accessibilityLabel="Open Play Area settings"
                    description={`${playArea.label} · ${cacheSource}`}
                    onPress={() => onNavigate("play-area")}
                    testID="settings-play-area-row"
                    title="Play Area"
                />

                <SheetListRow
                    accessibilityLabel="Open Hiding Zones settings"
                    description="Eligible transit stations for the hiding zone."
                    onPress={() => onNavigate("hiding-zone")}
                    testID="settings-hiding-zone-row"
                    title="Hiding Zones"
                />
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
    actionPressed: {
        opacity: 0.72,
    },
    actions: {
        gap: 10,
        marginTop: 18,
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
