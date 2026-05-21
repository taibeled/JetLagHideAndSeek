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

function tripleTap(element: ReturnType<typeof render>["getByTestId"]) {
    const el = element;
    fireEvent.press(el);
    fireEvent.press(el);
    fireEvent.press(el);
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
            screen.getByText(/^https:\/\/jetlag\.hinoka\.org\/i\/\?d=/),
        ).toBeTruthy();
        expect(screen.getByTestId("share-setup-copy-button")).toBeTruthy();
        expect(screen.getByTestId("share-setup-native-button")).toBeTruthy();
    });

    it("cycles through URL → full JSON → minified JSON → URL on triple-tap", () => {
        const screen = renderWithProviders(
            <SettingsScreen onNavigate={jest.fn()} />,
        );

        fireEvent.press(screen.getByTestId("settings-share-button"));

        expect(
            screen.getByText(/^https:\/\/jetlag\.hinoka\.org\/i\/\?d=/),
        ).toBeTruthy();

        const linkArea = screen.getByTestId("share-setup-link");

        tripleTap(linkArea);
        expect(screen.getByText(/"kind": "app-state"/)).toBeTruthy();
        expect(screen.getByText("Full JSON")).toBeTruthy();

        tripleTap(linkArea);
        expect(screen.getByText(/"k": "app-state"/)).toBeTruthy();
        expect(screen.getByText("Minified JSON")).toBeTruthy();

        tripleTap(linkArea);
        expect(
            screen.getByText(/^https:\/\/jetlag\.hinoka\.org\/i\/\?d=/),
        ).toBeTruthy();
    });
});
