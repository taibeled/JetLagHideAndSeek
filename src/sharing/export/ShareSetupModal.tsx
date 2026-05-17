import { useEffect, useMemo, useRef, useState } from "react";
import {
    Modal,
    NativeModules,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    View,
} from "react-native";

import type { PlayArea } from "@/features/map/playArea";
import type { HidingZoneExportState } from "@/sharing/export/buildEnvelope";
import { buildAppStateEnvelope } from "@/sharing/export/buildEnvelope";
import { buildImportLink } from "@/sharing/links/buildLink";
import { QRCodeView } from "@/sharing/qr/QRCodeView";
import { minifyEnvelope } from "@/sharing/wire/minified";
import { colors } from "@/theme/colors";

type ShareSetupModalProps = {
    hidingZones: HidingZoneExportState;
    onClose: () => void;
    playArea: PlayArea;
    visible: boolean;
};

export function ShareSetupModal({
    hidingZones,
    onClose,
    playArea,
    visible,
}: ShareSetupModalProps) {
    const [debugMode, setDebugMode] = useState<false | "full" | "minified">(
        false,
    );
    const [status, setStatus] = useState<string | null>(null);
    const tapCountRef = useRef(0);
    const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        };
    }, []);

    const envelope = useMemo(
        () =>
            buildAppStateEnvelope({
                hidingZones,
                playArea,
            }),
        [hidingZones, playArea],
    );

    const link = useMemo(
        () => buildImportLink({ envelope, mode: "custom-scheme" }),
        [envelope],
    );
    const canShowQr = link.length <= 2500;

    const handleLinkTripleTap = () => {
        tapCountRef.current += 1;
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

        if (tapCountRef.current >= 3) {
            tapCountRef.current = 0;
            setDebugMode((prev) =>
                prev === false ? "full" : prev === "full" ? "minified" : false,
            );
        } else {
            tapTimerRef.current = setTimeout(() => {
                tapCountRef.current = 0;
            }, 500);
        }
    };

    const copyLink = async () => {
        const copied = await copyToClipboard(link);
        setStatus(
            copied
                ? "Link copied."
                : "Copy is unavailable in this development build.",
        );
    };

    const shareLink = async () => {
        await Share.share({
            message: `Join this Hide & Seek setup:\n${link}`,
            url: link,
        });
    };

    return (
        <Modal
            animationType="slide"
            onRequestClose={onClose}
            transparent
            visible={visible}
        >
            <View style={styles.scrim}>
                <View style={styles.modal}>
                    <View style={styles.header}>
                        <View style={styles.headerCopy}>
                            <Text style={styles.eyebrow}>Share</Text>
                            <Text style={styles.title}>Game Setup</Text>
                        </View>
                        <Pressable
                            accessibilityLabel="Close sharing"
                            accessibilityRole="button"
                            onPress={onClose}
                            style={({ pressed }) => [
                                styles.closeButton,
                                pressed ? styles.actionPressed : null,
                            ]}
                            testID="share-setup-close-button"
                        >
                            <Text style={styles.closeText}>Close</Text>
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={styles.content}>
                        <View
                            style={styles.summary}
                            testID="share-setup-summary"
                        >
                            <Text style={styles.summaryLabel}>
                                Current setup
                            </Text>
                            <Text style={styles.summaryTitle}>
                                {playArea.label}
                            </Text>
                            <Text style={styles.summaryDetail}>
                                {hidingZones.selectedPresetIds.length} preset
                                {hidingZones.selectedPresetIds.length === 1
                                    ? ""
                                    : "s"}{" "}
                                selected ·{" "}
                                {Math.round(hidingZones.radiusMeters)}m radius
                            </Text>
                        </View>

                        {canShowQr ? (
                            <View
                                style={styles.qrShell}
                                testID="share-setup-qr"
                            >
                                <QRCodeView
                                    backgroundColor={colors.card}
                                    color={colors.ink}
                                    size={220}
                                    value={link}
                                />
                            </View>
                        ) : (
                            <View
                                style={styles.warning}
                                testID="share-setup-qr-warning"
                            >
                                <Text style={styles.warningTitle}>
                                    QR code unavailable
                                </Text>
                                <Text style={styles.warningDetail}>
                                    This custom setup link is too large for a QR
                                    code. Copy or share the link instead.
                                </Text>
                            </View>
                        )}

                        <Pressable
                            onPress={handleLinkTripleTap}
                            testID="share-setup-link"
                        >
                            {debugMode !== false ? (
                                <Text style={styles.debugLabel}>
                                    {debugMode === "full"
                                        ? "Full JSON"
                                        : "Minified JSON"}
                                </Text>
                            ) : null}
                            <Text selectable style={styles.linkText}>
                                {debugMode === "full"
                                    ? JSON.stringify(envelope, null, 2)
                                    : debugMode === "minified"
                                      ? JSON.stringify(
                                            minifyEnvelope(envelope),
                                            null,
                                            2,
                                        )
                                      : link}
                            </Text>
                        </Pressable>

                        <View style={styles.buttonRow}>
                            <Pressable
                                accessibilityLabel="Copy share link"
                                accessibilityRole="button"
                                onPress={copyLink}
                                style={({ pressed }) => [
                                    styles.secondaryButton,
                                    pressed ? styles.actionPressed : null,
                                ]}
                                testID="share-setup-copy-button"
                            >
                                <Text style={styles.secondaryButtonText}>
                                    Copy Link
                                </Text>
                            </Pressable>
                            <Pressable
                                accessibilityLabel="Open native share sheet"
                                accessibilityRole="button"
                                onPress={shareLink}
                                style={({ pressed }) => [
                                    styles.primaryButton,
                                    pressed ? styles.actionPressed : null,
                                ]}
                                testID="share-setup-native-button"
                            >
                                <Text style={styles.primaryButtonText}>
                                    Share
                                </Text>
                            </Pressable>
                        </View>
                        {status ? (
                            <Text style={styles.status} testID="share-status">
                                {status}
                            </Text>
                        ) : null}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    buttonRow: {
        flexDirection: "row",
        gap: 10,
    },
    closeButton: {
        backgroundColor: colors.buttonSubtle,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    closeText: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "800",
    },
    content: {
        gap: 16,
        paddingBottom: 22,
    },
    debugLabel: {
        color: colors.tint,
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 0,
        marginBottom: 4,
        textTransform: "uppercase",
    },
    eyebrow: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    header: {
        alignItems: "center",
        flexDirection: "row",
        gap: 12,
        justifyContent: "space-between",
        marginBottom: 16,
    },
    headerCopy: {
        flex: 1,
    },
    linkText: {
        backgroundColor: colors.buttonSubtle,
        borderRadius: 8,
        color: colors.ink,
        fontSize: 12,
        lineHeight: 17,
        padding: 12,
    },
    modal: {
        backgroundColor: colors.panel,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: "88%",
        padding: 20,
        width: "100%",
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
    qrShell: {
        alignItems: "center",
        alignSelf: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        padding: 18,
    },
    scrim: {
        backgroundColor: "rgba(23, 32, 42, 0.32)",
        flex: 1,
        justifyContent: "flex-end",
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
    status: {
        color: colors.tint,
        fontSize: 13,
        fontWeight: "800",
        textAlign: "center",
    },
    summary: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
        padding: 16,
    },
    summaryDetail: {
        color: colors.muted,
        fontSize: 14,
        lineHeight: 20,
    },
    summaryLabel: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    summaryTitle: {
        color: colors.ink,
        fontSize: 20,
        fontWeight: "800",
    },
    title: {
        color: colors.ink,
        fontSize: 24,
        fontWeight: "800",
        marginTop: 2,
    },
    warning: {
        backgroundColor: colors.buttonSubtle,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
        padding: 16,
    },
    warningDetail: {
        color: colors.muted,
        fontSize: 14,
        lineHeight: 20,
    },
    warningTitle: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "800",
    },
});

async function copyToClipboard(value: string): Promise<boolean> {
    const clipboard = NativeModules.ExpoClipboard as
        | {
              setStringAsync?: (text: string) => Promise<void>;
          }
        | undefined;

    if (!clipboard?.setStringAsync) return false;

    await clipboard.setStringAsync(value);
    return true;
}
