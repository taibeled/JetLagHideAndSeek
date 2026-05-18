import { StatusBar } from "expo-status-bar";
import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { NativeMap } from "@/features/map/NativeMap";
import {
    AppBottomSheet,
    type BottomSheetHandle,
} from "@/features/sheet/AppBottomSheet";
import { FabButton } from "@/features/sheet/FabButton";
import { colors } from "@/theme/colors";

export function MapAppScreen() {
    const bottomSheetRef = useRef<BottomSheetHandle>(null);
    const sheetIndexRef = useRef(0);

    const handleMapPress = useCallback(() => {
        if (sheetIndexRef.current === 1) {
            bottomSheetRef.current?.snapToIndex(0);
        }
    }, []);

    const handleSheetIndexChange = useCallback((index: number) => {
        sheetIndexRef.current = index;
    }, []);

    const handleFabPress = useCallback(() => {
        bottomSheetRef.current?.snapToIndex(0);
    }, []);

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            <NativeMap onPress={handleMapPress} />
            <FabButton onPress={handleFabPress} />
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
