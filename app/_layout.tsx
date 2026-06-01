import "react-native-gesture-handler";

import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";

import {
    AppStateProviders,
    useAppIsReady,
    useAppIsRestored,
} from "@/state/AppStateProviders";
import { configureNativeTileCache } from "@/features/map/mapTileCache";

// Keep the splash screen visible until restoration is complete. This
// prevents the user from seeing a blank map or a "jump" while persisted
// state is being applied. The splash fade-out animation naturally masks
// the map's first render frame.
SplashScreen.preventAutoHideAsync().catch(() => {
    // Splash screen API not available (e.g. web) — ignore.
});

function AppContent() {
    const isReady = useAppIsReady();
    const isRestored = useAppIsRestored();
    const [isTileCacheConfigured, setIsTileCacheConfigured] = useState(false);

    useEffect(() => {
        let cancelled = false;

        configureNativeTileCache()
            .catch((error: unknown) => {
                console.warn(
                    "Unable to configure the native tile cache.",
                    error,
                );
            })
            .finally(() => {
                if (!cancelled) {
                    setIsTileCacheConfigured(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isRestored || !isTileCacheConfigured) return;

        const hideSplash = () => {
            SplashScreen.hideAsync().catch(() => {
                // Ignore errors — splash may already be hidden.
            });
        };
        const timer = setTimeout(hideSplash, isReady ? 100 : 5000);
        return () => clearTimeout(timer);
    }, [isReady, isRestored, isTileCacheConfigured]);

    if (!isTileCacheConfigured) return null;

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
