import "react-native-gesture-handler";

import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppStateProviders } from "@/state/AppStateProviders";

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <AppStateProviders>
                    <Stack screenOptions={{ headerShown: false }} />
                </AppStateProviders>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
