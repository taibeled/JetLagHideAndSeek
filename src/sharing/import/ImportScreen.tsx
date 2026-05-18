import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { getImportErrorMessage } from "@/sharing/errors";
import { applyImport } from "@/sharing/import/applyImport";
import { buildImportPreview } from "@/sharing/import/preview";
import { parseImportPayload } from "@/sharing/links/parseLink";
import { useHidingZone } from "@/state/hidingZoneStore";
import { usePlayArea } from "@/state/playAreaStore";
import { useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

export function ImportScreen() {
    const { d } = useLocalSearchParams<{ d?: string | string[] }>();
    const router = useRouter();
    const playAreaStore = usePlayArea();
    const hidingZoneStore = useHidingZone();
    const questionStore = useQuestion();
    const [applyError, setApplyError] = useState<string | null>(null);

    const parsed = useMemo(() => parseImportPayload(d), [d]);
    const preview = useMemo(
        () => (parsed.ok ? buildImportPreview(parsed.envelope) : null),
        [parsed],
    );
    const importErrorMessage = !parsed.ok
        ? getImportErrorMessage(parsed.error)
        : null;

    const confirmImport = () => {
        if (!parsed.ok) return;
        const result = applyImport({
            envelope: parsed.envelope,
            stores: {
                hidingZones: hidingZoneStore,
                playArea: playAreaStore,
                questions: questionStore,
            },
        });
        if (!result.ok) {
            setApplyError(result.error);
            return;
        }
        router.replace("/");
    };

    const cancel = () => router.replace("/");

    return (
        <View style={styles.screen}>
            <View style={styles.panel}>
                <Text style={styles.eyebrow}>Import</Text>
                {parsed.ok && preview ? (
                    <>
                        <Text style={styles.title}>{preview.title}</Text>
                        <Text style={styles.detail}>
                            Review this shared setup before replacing your
                            current starting state.
                        </Text>
                        <View
                            style={styles.previewCard}
                            testID="import-preview-card"
                        >
                            <Text style={styles.previewLabel}>Setup</Text>
                            <Text style={styles.previewTitle}>
                                {preview.detail}
                            </Text>
                            <Text style={styles.metadata}>
                                Game {preview.gameId}
                            </Text>
                        </View>
                        {applyError ? (
                            <Text style={styles.error}>{applyError}</Text>
                        ) : null}
                        <View style={styles.buttonRow}>
                            <Pressable
                                accessibilityLabel="Cancel import"
                                accessibilityRole="button"
                                onPress={cancel}
                                style={({ pressed }) => [
                                    styles.secondaryButton,
                                    pressed ? styles.actionPressed : null,
                                ]}
                                testID="import-cancel-button"
                            >
                                <Text style={styles.secondaryButtonText}>
                                    Cancel
                                </Text>
                            </Pressable>
                            <Pressable
                                accessibilityLabel="Replace current game setup"
                                accessibilityRole="button"
                                onPress={confirmImport}
                                style={({ pressed }) => [
                                    styles.primaryButton,
                                    pressed ? styles.actionPressed : null,
                                ]}
                                testID="import-confirm-button"
                            >
                                <Text style={styles.primaryButtonText}>
                                    Replace Setup
                                </Text>
                            </Pressable>
                        </View>
                    </>
                ) : (
                    <>
                        <Text style={styles.title}>Invalid Share Link</Text>
                        <Text style={styles.detail} testID="import-error">
                            {importErrorMessage}
                        </Text>
                        <Pressable
                            accessibilityLabel="Return to map"
                            accessibilityRole="button"
                            onPress={cancel}
                            style={({ pressed }) => [
                                styles.primaryButton,
                                pressed ? styles.actionPressed : null,
                            ]}
                            testID="import-return-button"
                        >
                            <Text style={styles.primaryButtonText}>
                                Return to Map
                            </Text>
                        </Pressable>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    buttonRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 18,
    },
    detail: {
        color: colors.muted,
        fontSize: 15,
        lineHeight: 21,
        marginTop: 8,
    },
    error: {
        color: "#b42318",
        fontSize: 14,
        lineHeight: 20,
        marginTop: 12,
    },
    eyebrow: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    metadata: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
    },
    panel: {
        backgroundColor: colors.panel,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        padding: 20,
        width: "100%",
    },
    previewCard: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
        marginTop: 18,
        padding: 16,
    },
    previewLabel: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    previewTitle: {
        color: colors.ink,
        fontSize: 18,
        fontWeight: "800",
        lineHeight: 24,
    },
    primaryButton: {
        alignItems: "center",
        backgroundColor: colors.button,
        borderRadius: 8,
        flex: 1,
        paddingVertical: 14,
    },
    primaryButtonText: {
        color: colors.white,
        fontSize: 15,
        fontWeight: "800",
    },
    screen: {
        alignItems: "center",
        backgroundColor: colors.background,
        flex: 1,
        justifyContent: "center",
        padding: 20,
    },
    secondaryButton: {
        alignItems: "center",
        backgroundColor: colors.buttonSubtle,
        borderRadius: 8,
        flex: 1,
        paddingVertical: 14,
    },
    secondaryButtonText: {
        color: colors.ink,
        fontSize: 15,
        fontWeight: "800",
    },
    title: {
        color: colors.ink,
        fontSize: 28,
        fontWeight: "800",
        marginTop: 4,
    },
});
