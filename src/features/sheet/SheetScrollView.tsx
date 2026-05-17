import type { ComponentProps } from "react";
import { ScrollView, StyleSheet } from "react-native";

type SheetScrollViewProps = {
    children?: ComponentProps<typeof ScrollView>["children"];
    contentContainerStyle?: ComponentProps<
        typeof ScrollView
    >["contentContainerStyle"];
    style?: ComponentProps<typeof ScrollView>["style"];
};

export function SheetScrollView({
    children,
    contentContainerStyle,
    style,
}: SheetScrollViewProps) {
    return (
        <ScrollView
            style={[styles.scroll, style]}
            contentContainerStyle={[styles.content, contentContainerStyle]}
            keyboardShouldPersistTaps="handled"
            scrollIndicatorInsets={{ right: 4 }}
        >
            {children}
        </ScrollView>
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
