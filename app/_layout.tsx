import "react-native-gesture-handler";

import { Stack } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";

import {
    AppStateProviders,
    useAppIsRestored,
} from "@/state/AppStateProviders";

// Keep the splash screen visible until restoration is complete. This
// prevents the user from seeing a blank map or a "jump" while persisted
// state is being applied. The splash fade-out animation naturally masks
// the map's first render frame.
SplashScreen.preventAutoHideAsync().catch(() => {
    // Splash screen API not available (e.g. web) — ignore.
});

function AppContent() {
    const isRestored = useAppIsRestored();

    useEffect(() => {
        if (isRestored) {
            // Brief delay so the map has one frame to paint before the
            // splash fades out.
            const timer = setTimeout(() => {
                SplashScreen.hideAsync().catch(() => {
                    // Ignore errors — splash may already be hidden.
                });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isRestored]);

    return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <AppStateProviders>
                    <AppContent />
                </AppStateProviders>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
