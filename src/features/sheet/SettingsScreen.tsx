import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SheetListRow } from "@/components/SheetListRow";
import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import { ShareSetupModal } from "@/sharing/export/ShareSetupModal";
import { useHidingZoneState } from "@/state/hidingZoneStore";
import { usePlayArea } from "@/state/playAreaStore";
import { useQuestions } from "@/state/questionStore";
import { colors } from "@/theme/colors";

type SettingsScreenProps = {
    onNavigate: (route: SheetRouteName) => void;
};

export function SettingsScreen({ onNavigate }: SettingsScreenProps) {
    const { cacheSource, playArea } = usePlayArea();
    const { radiusMeters, radiusUnit, selectedPresetIds } =
        useHidingZoneState();
    const questions = useQuestions();
    const [isShareVisible, setIsShareVisible] = useState(false);

    return (
        <View style={styles.container}>
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
                <Text style={styles.shareButtonText} accessibilityLabel="Share">
                    Share
                </Text>
            </Pressable>

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
        gap: 8,
        marginTop: 12,
    },
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 0,
    },
    shareButton: {
        alignSelf: "flex-end",
        backgroundColor: colors.button,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    shareButtonText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: "800",
    },
});
