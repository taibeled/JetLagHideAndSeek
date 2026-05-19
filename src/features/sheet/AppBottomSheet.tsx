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
import { StyleSheet } from "react-native";

import { MainDrawer } from "@/features/sheet/MainDrawer";
import { SheetRouteName } from "@/features/sheet/sheetRoutes";
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

export const SHEET_SNAP_INDEX = {
    compact: 0,
    large: 2,
    medium: 1,
} as const;

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
    const { setQuestionSheetActive } = useQuestion();
    const currentIndexRef = useRef<number>(SHEET_SNAP_INDEX.medium);
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
            accessible={false}
            enableDynamicSizing={false}
            enablePanDownToClose
            handleIndicatorStyle={styles.handleIndicator}
            backgroundStyle={styles.sheetBackground}
            onChange={(index: number) => {
                currentIndexRef.current = index;
                setQuestionSheetActive(
                    index !== -1 && route === "question-detail",
                );
                onIndexChange?.(index);
            }}
        >
            <SheetView style={styles.content}>
                <MainDrawer route={route} onNavigate={setRoute} />
            </SheetView>
        </Sheet>
    );
});

function getRouteSnapIndex(route: SheetRouteName): number {
    return route === "play-area" || route === "hiding-zone"
        ? SHEET_SNAP_INDEX.large
        : SHEET_SNAP_INDEX.medium;
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
