import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { ComponentProps } from "react";
import { StyleSheet } from "react-native";

type SheetScrollViewProps = {
    children?: ComponentProps<typeof BottomSheetScrollView>["children"];
    contentContainerStyle?: ComponentProps<
        typeof BottomSheetScrollView
    >["contentContainerStyle"];
    style?: ComponentProps<typeof BottomSheetScrollView>["style"];
};

export function SheetScrollView({
    children,
    contentContainerStyle,
    style,
}: SheetScrollViewProps) {
    return (
        <BottomSheetScrollView
            style={[styles.scroll, style]}
            contentContainerStyle={[styles.content, contentContainerStyle]}
            keyboardShouldPersistTaps="handled"
            scrollIndicatorInsets={{ right: 4 }}
        >
            {children}
        </BottomSheetScrollView>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingBottom: 160,
    },
    scroll: {
        flex: 1,
    },
});
