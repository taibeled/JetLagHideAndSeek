import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import {
    type PlayAreaSearchResult,
    searchPlayAreas,
} from "@/features/playArea/playAreaSearch";
import { SheetScrollView } from "@/features/sheet/SheetScrollView";
import { usePlayArea } from "@/state/playAreaStore";
import { colors } from "@/theme/colors";

export function PlayAreaScreen() {
    const {
        applyPreset,
        applyRelationId,
        cacheSource,
        error,
        isLoading,
        playArea,
        presets,
    } = usePlayArea();
    const [relationId, setRelationId] = useState("");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PlayAreaSearchResult[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const relationInputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = query.trim();

        if (!trimmed) {
            setResults([]);
            setSearchError(null);
            setIsSearching(false);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setIsSearching(true);
            setSearchError(null);
            try {
                setResults(await searchPlayAreas(trimmed));
            } catch (err) {
                setSearchError(
                    err instanceof Error ? err.message : "Search failed.",
                );
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 350);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    const applyDirectRelation = async () => {
        const applied = await applyRelationId(relationId);
        if (applied) setRelationId("");
    };

    return (
        <SheetScrollView
            style={styles.container}
            contentContainerStyle={styles.scrollContent}
        >
            <Text style={styles.eyebrow}>Play Area</Text>
            <Text style={styles.title}>Map Boundary</Text>
            <Text style={styles.detail}>
                Choose the OSM relation that defines the game boundary.
            </Text>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Direct relation ID</Text>
                <View style={styles.inputRow}>
                    <Pressable
                        accessibilityLabel="OSM relation ID"
                        onPress={() => relationInputRef.current?.focus()}
                        style={styles.inputShell}
                        testID="play-area-relation-id-input"
                    >
                        <TextInput
                            keyboardType="number-pad"
                            onChangeText={setRelationId}
                            placeholder="358674"
                            ref={relationInputRef}
                            style={styles.inputText}
                            testID="play-area-relation-id-text-input"
                            value={relationId}
                        />
                    </Pressable>
                    <Pressable
                        accessibilityLabel="Apply OSM relation"
                        accessibilityRole="button"
                        disabled={isLoading}
                        onPress={applyDirectRelation}
                        style={({ pressed }) => [
                            styles.applyButton,
                            isLoading ? styles.buttonDisabled : null,
                            pressed ? styles.actionPressed : null,
                        ]}
                        testID="play-area-apply-relation-button"
                    >
                        {isLoading ? (
                            <ActivityIndicator color={colors.white} />
                        ) : (
                            <Text style={styles.applyButtonText}>Apply</Text>
                        )}
                    </Pressable>
                </View>
                {isLoading ? (
                    <Text style={styles.loading} testID="play-area-loading">
                        Loading boundary...
                    </Text>
                ) : null}
                {error ? (
                    <Text style={styles.error} testID="play-area-error">
                        {error}
                    </Text>
                ) : null}
            </View>

            <View style={styles.card} testID="current-play-area-card">
                <Text style={styles.cardLabel}>Current</Text>
                <Text style={styles.currentName}>{playArea.label}</Text>
                <Text style={styles.metadata}>Relation {playArea.osmId}</Text>
                <Text style={styles.metadata} testID="play-area-bbox">
                    Bbox {formatBbox(playArea.bbox)}
                </Text>
                <Text style={styles.metadata} testID="play-area-cache-status">
                    Boundary cache: {cacheSource}
                </Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Search</Text>
                <TextInput
                    accessibilityLabel="Search play areas"
                    onChangeText={setQuery}
                    placeholder="Search for a city or ward"
                    style={styles.input}
                    testID="play-area-search-input"
                    value={query}
                />
                {isSearching ? (
                    <Text style={styles.loading}>Searching...</Text>
                ) : null}
                {searchError ? (
                    <Text style={styles.error}>{searchError}</Text>
                ) : null}
                {results.map((result) => (
                    <ResultRow
                        key={result.osmId}
                        result={result}
                        onApply={() =>
                            void applyRelationId(String(result.osmId))
                        }
                    />
                ))}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Known presets</Text>
                {presets.map((preset) => (
                    <Pressable
                        accessibilityRole="button"
                        key={preset.osmId}
                        onPress={() => applyPreset(preset)}
                        style={({ pressed }) => [
                            styles.resultRow,
                            pressed ? styles.actionPressed : null,
                        ]}
                    >
                        <View style={styles.resultCopy}>
                            <Text style={styles.resultTitle}>
                                {preset.label}
                            </Text>
                            <Text style={styles.metadata}>
                                Relation {preset.osmId}
                            </Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                    </Pressable>
                ))}
            </View>
        </SheetScrollView>
    );
}

function ResultRow({
    onApply,
    result,
}: {
    onApply: () => void;
    result: PlayAreaSearchResult;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onApply}
            style={({ pressed }) => [
                styles.resultRow,
                pressed ? styles.actionPressed : null,
            ]}
        >
            <View style={styles.resultCopy}>
                <Text style={styles.resultTitle}>{result.label}</Text>
                <Text style={styles.metadata}>
                    {[result.state, result.country].filter(Boolean).join(", ")}
                    {result.state || result.country ? " · " : ""}Relation{" "}
                    {result.osmId}
                </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
        </Pressable>
    );
}

function formatBbox(bbox: [number, number, number, number]) {
    return `[${bbox.map((value) => value.toFixed(4)).join(", ")}]`;
}

const styles = StyleSheet.create({
    actionPressed: {
        opacity: 0.72,
    },
    applyButton: {
        alignItems: "center",
        backgroundColor: colors.button,
        borderRadius: 8,
        justifyContent: "center",
        minHeight: 48,
        minWidth: 88,
        paddingHorizontal: 16,
    },
    applyButtonText: {
        color: colors.white,
        fontSize: 15,
        fontWeight: "800",
    },
    buttonDisabled: {
        opacity: 0.65,
    },
    card: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
        marginTop: 18,
        padding: 16,
    },
    cardLabel: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    chevron: {
        color: colors.muted,
        fontSize: 28,
        lineHeight: 28,
    },
    container: {},
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 6,
    },
    currentName: {
        color: colors.ink,
        fontSize: 22,
        fontWeight: "800",
    },
    detail: {
        color: colors.muted,
        fontSize: 15,
        lineHeight: 21,
        marginTop: 6,
    },
    error: {
        color: "#b42318",
        fontSize: 13,
        fontWeight: "700",
        marginTop: 8,
    },
    eyebrow: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    input: {
        backgroundColor: colors.white,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        color: colors.ink,
        flex: 1,
        fontSize: 16,
        minHeight: 48,
        paddingHorizontal: 14,
    },
    inputShell: {
        backgroundColor: colors.white,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flex: 1,
        justifyContent: "center",
        minHeight: 48,
    },
    inputText: {
        color: colors.ink,
        fontSize: 16,
        minHeight: 48,
        paddingHorizontal: 14,
    },
    inputRow: {
        alignItems: "center",
        flexDirection: "row",
        gap: 10,
    },
    loading: {
        color: colors.muted,
        fontSize: 13,
        fontWeight: "700",
        marginTop: 8,
    },
    metadata: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18,
    },
    resultCopy: {
        flex: 1,
    },
    resultRow: {
        alignItems: "center",
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        justifyContent: "space-between",
        marginTop: 10,
        minHeight: 64,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    resultTitle: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "800",
    },
    section: {
        marginTop: 22,
    },
    sectionTitle: {
        color: colors.ink,
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 10,
    },
    title: {
        color: colors.ink,
        fontSize: 28,
        fontWeight: "800",
        marginTop: 4,
    },
});
