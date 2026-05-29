import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import type { ComponentType } from "react";
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import { Keyboard, StyleSheet } from "react-native";

import { MainDrawer } from "@/features/sheet/MainDrawer";
import { SHEET_SNAP_INDEX, SheetRouteName } from "@/features/sheet/sheetRoutes";
import { useQuestion } from "@/state/questionStore";
import { colors } from "@/theme/colors";

const Sheet = BottomSheet as ComponentType<any>;
const SheetView = BottomSheetView as ComponentType<any>;

export type BottomSheetHandle = {
    snapToIndex: (index: number) => void;
};

type AppBottomSheetProps = {
    onIndexChange?: (index: number) => void;
};

const SHEET_SNAP_POINTS = ["18%", "42%", "88%"] as const;

export const AppBottomSheet = forwardRef<
    BottomSheetHandle,
    AppBottomSheetProps
>(function AppBottomSheet({ onIndexChange }, ref) {
    const sheetRef = useRef<{ snapToIndex?: (index: number) => void } | null>(
        null,
    );
    const snapPoints = useMemo(() => [...SHEET_SNAP_POINTS], []);
    const [route, setRoute] = useState<SheetRouteName>("main");
    const [sheetIndex, setSheetIndex] = useState<number>(
        SHEET_SNAP_INDEX.medium,
    );
    const { activeQuestion, setQuestionSheetActive } = useQuestion();
    const currentIndexRef = useRef<number>(SHEET_SNAP_INDEX.medium);
    const sheetAccessibilityLabel = getSheetAccessibilityLabel(
        route,
        activeQuestion,
    );
    const isSheetAccessible = sheetAccessibilityLabel !== undefined;
    useImperativeHandle(ref, () => ({
        snapToIndex(index: number) {
            sheetRef.current?.snapToIndex?.(index);
        },
    }));

    useEffect(() => {
        const target = getRouteSnapIndex(route);
        if (
            currentIndexRef.current === -1 ||
            target > currentIndexRef.current
        ) {
            sheetRef.current?.snapToIndex?.(target);
        }
    }, [route]);

    useEffect(() => {
        setQuestionSheetActive(route === "question-detail");
    }, [route, setQuestionSheetActive]);

    return (
        <Sheet
            ref={sheetRef}
            index={SHEET_SNAP_INDEX.medium}
            snapPoints={snapPoints}
            enableDynamicSizing={false}
            enablePanDownToClose
            handleIndicatorStyle={styles.handleIndicator}
            backgroundStyle={styles.sheetBackground}
            accessible={isSheetAccessible}
            accessibilityLabel={sheetAccessibilityLabel}
            onChange={(index: number) => {
                if (index === SHEET_SNAP_INDEX.compact || index === -1) {
                    Keyboard.dismiss();
                }
                currentIndexRef.current = index;
                setSheetIndex(index);
                setQuestionSheetActive(
                    index !== -1 && route === "question-detail",
                );
                onIndexChange?.(index);
            }}
        >
            <SheetView
                accessible={isSheetAccessible}
                accessibilityLabel={sheetAccessibilityLabel}
                style={styles.content}
            >
                <MainDrawer
                    route={route}
                    onNavigate={setRoute}
                    sheetIndex={sheetIndex}
                />
            </SheetView>
        </Sheet>
    );
});

function getRouteSnapIndex(route: SheetRouteName): number {
    return route === "play-area" || route === "hiding-zone"
        ? SHEET_SNAP_INDEX.large
        : SHEET_SNAP_INDEX.medium;
}

function getSheetAccessibilityLabel(
    route: SheetRouteName,
    activeQuestion: ReturnType<typeof useQuestion>["activeQuestion"],
): string | undefined {
    if (route === "question-detail" && activeQuestion?.type === "matching") {
        return "Transit line question detail. Transit line answer section. Set transit line pin to my location. Hit answer.";
    }
    return undefined;
}

const styles = StyleSheet.create({
    content: {
        bottom: 0,
        flex: 1,
        paddingBottom: 32,
    },
    handleIndicator: {
        backgroundColor: "#b8b1a4",
        width: 44,
    },
    sheetBackground: {
        backgroundColor: colors.panel,
        borderRadius: 32,
    },
});
