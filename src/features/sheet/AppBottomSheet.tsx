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
import { colors } from "@/theme/colors";

const Sheet = BottomSheet as ComponentType<any>;
const SheetView = BottomSheetView as ComponentType<any>;

export type BottomSheetHandle = {
    snapToIndex: (index: number) => void;
};

type AppBottomSheetProps = {
    onIndexChange?: (index: number) => void;
};

const SNAP_42 = 0;
const SNAP_88 = 1;

export const AppBottomSheet = forwardRef<
    BottomSheetHandle,
    AppBottomSheetProps
>(function AppBottomSheet({ onIndexChange }, ref) {
    const sheetRef = useRef<{ snapToIndex?: (index: number) => void } | null>(
        null,
    );
    const snapPoints = useMemo(() => ["42%", "88%"], []);
    const [route, setRoute] = useState<SheetRouteName>("main");
    const currentIndexRef = useRef(0);
    useImperativeHandle(ref, () => ({
        snapToIndex(index: number) {
            sheetRef.current?.snapToIndex?.(index);
        },
    }));

    useEffect(() => {
        const target =
            route === "play-area" || route === "hiding-zone"
                ? SNAP_88
                : SNAP_42;
        if (
            currentIndexRef.current === -1 ||
            target > currentIndexRef.current
        ) {
            sheetRef.current?.snapToIndex?.(target);
        }
    }, [route]);

    return (
        <Sheet
            ref={sheetRef}
            index={0}
            snapPoints={snapPoints}
            accessible={false}
            enableDynamicSizing={false}
            enablePanDownToClose
            handleIndicatorStyle={styles.handleIndicator}
            backgroundStyle={styles.sheetBackground}
            onChange={(index: number) => {
                currentIndexRef.current = index;
                onIndexChange?.(index);
            }}
        >
            <SheetView style={styles.content}>
                <MainDrawer route={route} onNavigate={setRoute} />
            </SheetView>
        </Sheet>
    );
});

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
