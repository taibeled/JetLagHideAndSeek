import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

export default function NotFoundRoute() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Route not found</Text>
            <Link href="/" style={styles.link}>
                Return to map
            </Link>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: "center",
        backgroundColor: colors.background,
        flex: 1,
        gap: 12,
        justifyContent: "center",
        padding: 24,
    },
    link: {
        color: colors.tint,
        fontSize: 16,
        fontWeight: "800",
    },
    title: {
        color: colors.ink,
        fontSize: 22,
        fontWeight: "800",
    },
});
