import { fireEvent, render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SettingsScreen } from "@/features/sheet/SettingsScreen";
import { AppStateProviders } from "@/state/AppStateProviders";

function renderWithProviders(ui: ReactElement) {
    return render(
        <SafeAreaProvider
            initialMetrics={{
                frame: { height: 844, width: 390, x: 0, y: 0 },
                insets: { bottom: 34, left: 0, right: 0, top: 47 },
            }}
        >
            <AppStateProviders>{ui as any}</AppStateProviders>
        </SafeAreaProvider>,
    );
}

describe("SettingsScreen sharing", () => {
    it("shows a top-right share button and opens the setup share modal", () => {
        const screen = renderWithProviders(
            <SettingsScreen onNavigate={jest.fn()} />,
        );

        expect(screen.getByTestId("settings-share-button")).toBeTruthy();

        fireEvent.press(screen.getByTestId("settings-share-button"));

        expect(screen.getByTestId("share-setup-summary")).toBeTruthy();
        expect(screen.getByTestId("share-setup-qr")).toBeTruthy();
        expect(
            screen.getByText(/^jetlag-hide-seek-v2:\/\/import\?d=/),
        ).toBeTruthy();
        expect(screen.getByTestId("share-setup-copy-button")).toBeTruthy();
        expect(screen.getByTestId("share-setup-native-button")).toBeTruthy();
    });

    it("triple-tap on the link toggles between URL and raw JSON", () => {
        const screen = renderWithProviders(
            <SettingsScreen onNavigate={jest.fn()} />,
        );

        fireEvent.press(screen.getByTestId("settings-share-button"));

        expect(
            screen.getByText(/^jetlag-hide-seek-v2:\/\/import\?d=/),
        ).toBeTruthy();

        const linkArea = screen.getByTestId("share-setup-link");

        fireEvent.press(linkArea);
        fireEvent.press(linkArea);
        fireEvent.press(linkArea);

        expect(screen.getByText(/"kind": "app-state"/)).toBeTruthy();

        fireEvent.press(linkArea);
        fireEvent.press(linkArea);
        fireEvent.press(linkArea);

        expect(
            screen.getByText(/^jetlag-hide-seek-v2:\/\/import\?d=/),
        ).toBeTruthy();
    });
});
