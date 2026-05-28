import { StatusBar } from "expo-status-bar";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { NativeMap } from "@/features/map/NativeMap";
import {
    AppBottomSheet,
    type BottomSheetHandle,
} from "@/features/sheet/AppBottomSheet";
import { FabButton } from "@/features/sheet/FabButton";
import { SHEET_SNAP_INDEX } from "@/features/sheet/sheetRoutes";
import { colors } from "@/theme/colors";

export function MapAppScreen() {
    const bottomSheetRef = useRef<BottomSheetHandle>(null);
    const sheetIndexRef = useRef<number>(SHEET_SNAP_INDEX.medium);
    const [sheetIndex, setSheetIndex] = useState<number>(
        SHEET_SNAP_INDEX.medium,
    );

    const handleMapPress = useCallback(() => {
        if (sheetIndexRef.current === SHEET_SNAP_INDEX.large) {
            bottomSheetRef.current?.snapToIndex(SHEET_SNAP_INDEX.compact);
        }
    }, []);

    const handleSheetIndexChange = useCallback((index: number) => {
        sheetIndexRef.current = index;
        setSheetIndex(index);
    }, []);

    const handleFabPress = useCallback(() => {
        bottomSheetRef.current?.snapToIndex(SHEET_SNAP_INDEX.medium);
    }, []);

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            <NativeMap onPress={handleMapPress} />
            <FabButton
                accessibilityHidden={sheetIndex !== -1}
                onPress={handleFabPress}
            />
            <AppBottomSheet
                ref={bottomSheetRef}
                onIndexChange={handleSheetIndexChange}
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
