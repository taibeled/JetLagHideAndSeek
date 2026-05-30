import { StatusBar } from "expo-status-bar";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { NativeMap } from "@/features/map/NativeMap";
import {
    AppBottomSheet,
    type BottomSheetHandle,
} from "@/features/sheet/AppBottomSheet";
import { FabButton } from "@/features/sheet/FabButton";
import {
    SHEET_SNAP_INDEX,
    type SheetRouteName,
} from "@/features/sheet/sheetRoutes";
import { colors } from "@/theme/colors";

export function MapAppScreen() {
    const bottomSheetRef = useRef<BottomSheetHandle>(null);
    const sheetIndexRef = useRef<number>(SHEET_SNAP_INDEX.medium);
    const [sheetIndex, setSheetIndex] = useState<number>(
        SHEET_SNAP_INDEX.medium,
    );
    const [sheetRoute, setSheetRoute] = useState<SheetRouteName>("main");
    const isQuestionDetailRoute = sheetRoute === "question-detail";

    const handleMapPress = useCallback(() => {
        if (sheetIndexRef.current === SHEET_SNAP_INDEX.large) {
            bottomSheetRef.current?.snapToIndex(SHEET_SNAP_INDEX.compact);
        }
    }, []);

    const handleSheetIndexChange = useCallback((index: number) => {
        sheetIndexRef.current = index;
        setSheetIndex(index);
    }, []);

    const handleSheetRouteChange = useCallback((route: SheetRouteName) => {
        setSheetRoute(route);
    }, []);

    const handleFabPress = useCallback(() => {
        bottomSheetRef.current?.snapToIndex(SHEET_SNAP_INDEX.medium);
    }, []);

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            <NativeMap
                isQuestionDetailRoute={isQuestionDetailRoute}
                onPress={handleMapPress}
            />
            <FabButton
                accessibilityHidden={sheetIndex !== -1}
                onPress={handleFabPress}
            />
            <AppBottomSheet
                ref={bottomSheetRef}
                onIndexChange={handleSheetIndexChange}
                onRouteChange={handleSheetRouteChange}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        backgroundColor: colors.background,
        flex: 1,
    },
});
