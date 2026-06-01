import { act, render, waitFor } from "@testing-library/react-native";
import { OfflineManager } from "@maplibre/maplibre-react-native";
import { Stack } from "expo-router";

import {
    AMBIENT_TILE_CACHE_SIZE_BYTES,
    clearNativeTileCacheConfigurationForTests,
} from "@/features/map/mapTileCache";

import RootLayout from "../_layout";

jest.mock("expo-router", () => {
    const React = require("react");
    const { View } = require("react-native");

    return {
        Stack: jest.fn((props) =>
            React.createElement(View, { ...props, testID: "router-stack" }),
        ),
    };
});

jest.mock("expo-splash-screen", () => ({
    hideAsync: jest.fn().mockResolvedValue(undefined),
    preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("react-native-safe-area-context", () => ({
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const setMaximumAmbientCacheSize =
    OfflineManager.setMaximumAmbientCacheSize as jest.MockedFunction<
        typeof OfflineManager.setMaximumAmbientCacheSize
    >;
const stack = Stack as unknown as jest.Mock;

describe("RootLayout", () => {
    beforeEach(() => {
        clearNativeTileCacheConfigurationForTests();
        setMaximumAmbientCacheSize.mockReset();
        stack.mockClear();
    });

    it("configures MapLibre's ambient cache before rendering the route stack", async () => {
        let resolveConfiguration!: () => void;
        setMaximumAmbientCacheSize.mockReturnValue(
            new Promise<void>((resolve) => {
                resolveConfiguration = resolve;
            }),
        );

        const screen = render(<RootLayout />);

        expect(screen.queryByTestId("router-stack")).toBeNull();
        expect(setMaximumAmbientCacheSize).toHaveBeenCalledWith(
            AMBIENT_TILE_CACHE_SIZE_BYTES,
        );

        await act(async () => {
            resolveConfiguration();
        });

        await waitFor(() => {
            expect(screen.getByTestId("router-stack")).toBeTruthy();
        });
    });

    it("keeps the app usable when native cache configuration fails", async () => {
        const error = new Error("native cache unavailable");
        const consoleWarn = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {});
        setMaximumAmbientCacheSize.mockRejectedValue(error);

        const screen = render(<RootLayout />);

        await waitFor(() => {
            expect(screen.getByTestId("router-stack")).toBeTruthy();
        });
        expect(consoleWarn).toHaveBeenCalledWith(
            "Unable to configure the native tile cache.",
            error,
        );
        consoleWarn.mockRestore();
    });
});
