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

export const AppBottomSheet = forwardRef<
    BottomSheetHandle,
    AppBottomSheetProps
>(function AppBottomSheet({ onIndexChange }, ref) {
    const sheetRef = useRef<{ snapToIndex?: (index: number) => void } | null>(
        null,
    );
    const snapPoints = useMemo(() => ["18%", "42%", "88%"], []);
    const [route, setRoute] = useState<SheetRouteName>("main");
    const currentIndexRef = useRef(1);
    useImperativeHandle(ref, () => ({
        snapToIndex(index: number) {
            sheetRef.current?.snapToIndex?.(index);
        },
    }));

    useEffect(() => {
        const target = route === "play-area" || route === "hiding-zone" ? 2 : 1;
        if (target > currentIndexRef.current) {
            sheetRef.current?.snapToIndex?.(target);
        }
    }, [route]);

    return (
        <Sheet
            ref={sheetRef}
            index={1}
            snapPoints={snapPoints}
            accessible={false}
            enableDynamicSizing={false}
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
