import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    BackHandler,
    Dimensions,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

import { HidingZoneScreen } from "@/features/hidingZone/HidingZoneScreen";
import { PlayAreaScreen } from "@/features/playArea/PlayAreaScreen";
import { AddQuestionScreen } from "@/features/questions/AddQuestionScreen";
import {
    QuestionDetailScreen,
    QuestionPinLockButton,
} from "@/features/questions/QuestionDetailScreen";
import { QuestionsScreen } from "@/features/questions/QuestionsScreen";
import { SettingsScreen } from "@/features/sheet/SettingsScreen";
import type { SheetRouteName } from "@/features/sheet/sheetRoutes";
import { getBackTarget, getNavDirection } from "@/features/sheet/sheetNav";
import { colors } from "@/theme/colors";

const SHEET_WIDTH = Dimensions.get("window").width;
const TRANSITION_MS = 300;

type TransitionDirection = "forward" | "back";

type SheetTransition = {
    direction: TransitionDirection;
    from: SheetRouteName;
    id: number;
    isAnimating: boolean;
    to: SheetRouteName;
};

type MainDrawerProps = {
    route: SheetRouteName;
    onNavigate: (route: SheetRouteName) => void;
};

const routeContent: Record<SheetRouteName, { title: string; detail: string }> =
    {
        "add-question": {
            detail: "Choose a question type to preview on the map.",
            title: "Add Question",
        },
        main: {
            detail: "Choose a workflow to start shaping the game.",
            title: "Game Setup",
        },
        questions: {
            detail: "Review answers and question geometry.",
            title: "Questions",
        },
        "question-detail": {
            detail: "Tune the distance and move the map pin.",
            title: "Radar Question",
        },
        settings: {
            detail: "Play area, units, and sharing controls will live here.",
            title: "Settings",
        },
        "play-area": {
            detail: "Choose the boundary for the game map.",
            title: "Play Area",
        },
        "hiding-zone": {
            detail: "Select eligible transit stations for the hiding zone.",
            title: "Hiding Zones",
        },
    };

export function MainDrawer({ route, onNavigate }: MainDrawerProps) {
    const [displayedRoute, setDisplayedRoute] = useState(route);
    const displayedRouteRef = useRef(route);
    const [transition, setTransition] = useState<SheetTransition | null>(null);
    const transitionIdRef = useRef(0);
    const startedTransitionIdRef = useRef<number | null>(null);
    const currentRoute = transition?.to ?? displayedRoute;
    const backTarget = getBackTarget(currentRoute);
    const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const leavingX = useSharedValue(0);
    const enteringX = useSharedValue(0);
    const transitionId = transition?.id ?? null;
    const transitionDirection = transition?.direction ?? null;

    const leavingStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: leavingX.value }],
    }));

    const enteringStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: enteringX.value }],
    }));

    const beginTransition = useCallback(
        (from: SheetRouteName, to: SheetRouteName) => {
            if (to === from) return;
            if (cleanupTimerRef.current) {
                clearTimeout(cleanupTimerRef.current);
                cleanupTimerRef.current = null;
            }

            const dir = getNavDirection(from, to);
            const id = transitionIdRef.current + 1;
            transitionIdRef.current = id;
            startedTransitionIdRef.current = null;

            leavingX.value = 0;
            enteringX.value = getEnteringStartX(dir);
            displayedRouteRef.current = to;
            setDisplayedRoute(to);
            setTransition({
                direction: dir,
                from,
                id,
                isAnimating: false,
                to,
            });
        },
        [enteringX, leavingX],
    );

    const handleNavigate = useCallback(
        (to: SheetRouteName) => {
            const from = displayedRouteRef.current;
            if (to === from) return;
            beginTransition(from, to);
            onNavigate(to);
        },
        [beginTransition, onNavigate],
    );

    useEffect(() => {
        if (route === displayedRouteRef.current) return;
        beginTransition(displayedRouteRef.current, route);
    }, [beginTransition, route]);

    useEffect(() => {
        if (transitionDirection === null || transitionId === null) return;
        if (startedTransitionIdRef.current === transitionId) return;
        startedTransitionIdRef.current = transitionId;

        const isBack = transitionDirection === "back";

        leavingX.value = 0;
        enteringX.value = getEnteringStartX(transitionDirection);
        setTransition((current) =>
            current?.id === transitionId
                ? { ...current, isAnimating: true }
                : current,
        );

        leavingX.value = withTiming(isBack ? SHEET_WIDTH : -SHEET_WIDTH, {
            duration: TRANSITION_MS,
        });
        enteringX.value = withTiming(0, { duration: TRANSITION_MS });

        cleanupTimerRef.current = setTimeout(() => {
            setTransition((current) =>
                current?.id === transitionId ? null : current,
            );
        }, TRANSITION_MS);
    }, [enteringX, leavingX, transitionDirection, transitionId]);

    useEffect(() => {
        return () => {
            if (cleanupTimerRef.current) {
                clearTimeout(cleanupTimerRef.current);
                cleanupTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!backTarget) return;
        const onBackPress = () => {
            handleNavigate(backTarget);
            return true;
        };
        const sub = BackHandler.addEventListener(
            "hardwareBackPress",
            onBackPress,
        );
        return () => sub.remove();
    }, [backTarget, handleNavigate]);

    const edgeGesture = useMemo(
        () =>
            Gesture.Pan()
                .activeOffsetX(10)
                .onEnd((event) => {
                    if (event.translationX > 80 || event.velocityX > 500) {
                        runOnJS(handleNavigate)(backTarget!);
                    }
                }),
        [handleNavigate, backTarget],
    );

    return (
        <View style={styles.transitionContainer}>
            {transition ? (
                <Animated.View
                    key={`leaving-${transition.id}-${transition.from}`}
                    style={[
                        styles.animatedFill,
                        getLeavingLayerStyle(transition.direction),
                        transition.isAnimating ? leavingStyle : null,
                    ]}
                >
                    {renderRouteContent(transition.from, handleNavigate)}
                </Animated.View>
            ) : null}

            <Animated.View
                key={
                    transition
                        ? `entering-${transition.id}-${transition.to}`
                        : `current-${displayedRoute}`
                }
                style={[
                    styles.animatedFill,
                    transition
                        ? getEnteringLayerStyle(transition.direction)
                        : null,
                    transition
                        ? transition.isAnimating
                            ? enteringStyle
                            : getEnteringInitialStyle(transition.direction)
                        : null,
                ]}
            >
                {renderRouteContent(currentRoute, handleNavigate)}
            </Animated.View>

            {backTarget ? (
                <GestureDetector gesture={edgeGesture}>
                    <View
                        testID="edge-swipe-back-slab"
                        style={styles.edgeSlab}
                    />
                </GestureDetector>
            ) : null}
        </View>
    );
}

function getEnteringStartX(direction: TransitionDirection) {
    return direction === "back" ? -SHEET_WIDTH : SHEET_WIDTH;
}

function getEnteringInitialStyle(direction: TransitionDirection) {
    return {
        transform: [{ translateX: getEnteringStartX(direction) }],
    };
}

function getLeavingLayerStyle(direction: TransitionDirection) {
    return {
        zIndex: direction === "back" ? 2 : 1,
    };
}

function getEnteringLayerStyle(direction: TransitionDirection) {
    return {
        zIndex: direction === "back" ? 1 : 2,
    };
}

function renderRouteContent(
    routeName: SheetRouteName,
    onNavigate: (route: SheetRouteName) => void,
) {
    switch (routeName) {
        case "settings":
            return (
                <View style={styles.container}>
                    <BackButton onPress={() => onNavigate("main")} />
                    <SettingsScreen onNavigate={onNavigate} />
                </View>
            );
        case "play-area":
            return (
                <View style={styles.fullContainer}>
                    <View style={styles.backButtonRow}>
                        <BackButton onPress={() => onNavigate("settings")} />
                    </View>
                    <PlayAreaScreen />
                </View>
            );
        case "hiding-zone":
            return (
                <View style={styles.fullContainer}>
                    <View style={styles.backButtonRow}>
                        <BackButton onPress={() => onNavigate("settings")} />
                    </View>
                    <HidingZoneScreen />
                </View>
            );
        case "questions":
            return (
                <View style={styles.fullContainer}>
                    <View style={styles.backButtonRow}>
                        <BackButton onPress={() => onNavigate("main")} />
                    </View>
                    <QuestionsScreen onNavigate={onNavigate} />
                </View>
            );
        case "add-question":
            return (
                <View style={styles.fullContainer}>
                    <View style={styles.backButtonRow}>
                        <BackButton onPress={() => onNavigate("questions")} />
                    </View>
                    <AddQuestionScreen onNavigate={onNavigate} />
                </View>
            );
        case "question-detail":
            return (
                <View style={styles.fullContainer}>
                    <View style={styles.backButtonRow}>
                        <BackButton onPress={() => onNavigate("questions")} />
                        <QuestionPinLockButton />
                    </View>
                    <QuestionDetailScreen onNavigate={onNavigate} />
                </View>
            );
        default: {
            const content = routeContent[routeName];
            return (
                <View style={styles.container}>
                    <View style={styles.header}>
                        {routeName !== "main" ? (
                            <BackButton onPress={() => onNavigate("main")} />
                        ) : null}
                        <Text style={styles.eyebrow}>Mobile v2</Text>
                        <Text style={styles.title}>{content.title}</Text>
                        <Text style={styles.detail}>{content.detail}</Text>
                    </View>

                    <View style={styles.actions}>
                        <DrawerAction
                            title="Questions"
                            description="Review answers and question geometry."
                            isActive={false}
                            onPress={() => onNavigate("questions")}
                            testID="main-questions-row"
                        />
                        <DrawerAction
                            title="Settings"
                            description="Adjust the play area and app preferences."
                            isActive={false}
                            onPress={() => onNavigate("settings")}
                            testID="main-settings-row"
                        />
                    </View>
                </View>
            );
        }
    }
}

function BackButton({ onPress }: { onPress: () => void }) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={styles.backButton}
        >
            <Text style={styles.backText}>Back</Text>
        </Pressable>
    );
}

type DrawerActionProps = {
    description: string;
    isActive: boolean;
    onPress: () => void;
    testID: string;
    title: string;
};

function DrawerAction({
    description,
    isActive,
    onPress,
    testID,
    title,
}: DrawerActionProps) {
    return (
        <Pressable
            accessible
            accessibilityLabel={title}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.action,
                isActive ? styles.actionActive : null,
                pressed ? styles.actionPressed : null,
            ]}
            testID={testID}
        >
            <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>{title}</Text>
                <Text style={styles.actionDescription}>{description}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
        </Pressable>
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
        minHeight: 62,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    actionActive: {
        backgroundColor: "#e6f2ef",
        borderColor: colors.tint,
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
        gap: 8,
    },
    actionTitle: {
        color: colors.ink,
        fontSize: 17,
        fontWeight: "700",
    },
    animatedFill: {
        ...StyleSheet.absoluteFillObject,
    },
    backButton: {
        alignSelf: "flex-start",
        paddingVertical: 4,
    },
    backButtonRow: {
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        minHeight: 42,
        paddingBottom: 8,
        paddingHorizontal: 20,
    },
    fullContainer: {
        flex: 1,
    },
    backText: {
        color: colors.tint,
        fontSize: 16,
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
    },
    detail: {
        color: colors.muted,
        fontSize: 14,
        lineHeight: 19,
        marginTop: 4,
    },
    edgeSlab: {
        bottom: 0,
        left: 0,
        position: "absolute",
        top: 0,
        width: 20,
    },
    eyebrow: {
        color: colors.tint,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0,
        textTransform: "uppercase",
    },
    header: {
        paddingBottom: 10,
        paddingTop: 2,
    },
    title: {
        color: colors.ink,
        fontSize: 24,
        fontWeight: "800",
        marginTop: 2,
    },
    transitionContainer: {
        flex: 1,
        overflow: "hidden",
    },
});
