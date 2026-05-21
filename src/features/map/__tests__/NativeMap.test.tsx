import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { HidingZoneProvider, useHidingZone } from "@/state/hidingZoneStore";
import { PlayAreaProvider } from "@/state/playAreaStore";
import { QuestionProvider } from "@/state/questionStore";

import { NativeMap } from "../NativeMap";

const { __cameraMethods } = jest.requireMock(
    "@maplibre/maplibre-react-native",
) as {
    __cameraMethods: {
        fitBounds: jest.Mock;
        setCamera: jest.Mock;
    };
};

function renderWithSafeArea(ui: ReactElement) {
    return render(
        <SafeAreaProvider
            initialMetrics={{
                frame: { height: 844, width: 390, x: 0, y: 0 },
                insets: { bottom: 34, left: 0, right: 0, top: 47 },
            }}
        >
            <PlayAreaProvider>
                <HidingZoneProvider>
                    <QuestionProvider>{ui as any}</QuestionProvider>
                </HidingZoneProvider>
            </PlayAreaProvider>
        </SafeAreaProvider>,
    );
}

function SelectTokyoMetroHidingZone() {
    const { addPreset } = useHidingZone();

    useEffect(() => {
        addPreset("tokyo-metro");
    }, [addPreset]);

    return null;
}

function signedRingArea(ring: number[][]): number {
    let area = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
        const [x1, y1] = ring[index];
        const [x2, y2] = ring[index + 1];
        area += x1 * y2 - x2 * y1;
    }
    return area / 2;
}

describe("NativeMap", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders the map, Tokyo boundary, and controls", () => {
        const screen = renderWithSafeArea(<NativeMap />);

        expect(screen.getByTestId("native-map")).toBeTruthy();
        expect(screen.getByText("Tokyo 23 Wards")).toBeTruthy();
        expect(screen.getByText("🗺️")).toBeTruthy();
        expect(screen.getByText("📍")).toBeTruthy();
        expect(
            screen
                .getAllByTestId("map-shape-source")
                .some(
                    (source) =>
                        source.props.id === "play-area-boundary-19631009",
                ),
        ).toBe(true);
        expect(
            screen
                .getAllByTestId("map-line-layer")
                .some(
                    (layer) =>
                        layer.props.id === "play-area-boundary-line-19631009",
                ),
        ).toBe(true);
        expect(
            screen
                .getAllByTestId("map-shape-source")
                .some(
                    (source) =>
                        source.props.id === "play-area-outside-mask-19631009",
                ),
        ).toBe(true);
        expect(
            screen
                .getAllByTestId("map-fill-layer")
                .some(
                    (layer) =>
                        layer.props.id ===
                            "play-area-outside-mask-fill-19631009" &&
                        layer.props.style.fillOpacity > 0.5,
                ),
        ).toBe(true);
        expect(
            screen
                .getAllByTestId("map-fill-layer")
                .some((layer) => layer.props.id === "hiding-zone-area-fill"),
        ).toBe(false);
    });

    it("renders a combined inside mask when hiding zones are set", async () => {
        const screen = renderWithSafeArea(
            <>
                <SelectTokyoMetroHidingZone />
                <NativeMap />
            </>,
        );

        await waitFor(() => {
            expect(
                screen
                    .getAllByTestId("map-shape-source")
                    .some(
                        (source) =>
                            source.props.id === "combined-inside-mask-19631009",
                    ),
            ).toBe(true);
        });

        const playAreaMask = screen
            .getAllByTestId("map-fill-layer")
            .find(
                (layer) =>
                    layer.props.id === "play-area-outside-mask-fill-19631009",
            );
        const combinedMask = screen
            .getAllByTestId("map-fill-layer")
            .find(
                (layer) =>
                    layer.props.id === "combined-inside-mask-fill-19631009",
            );
        const combinedMaskShape = screen
            .getAllByTestId("map-shape-source")
            .find(
                (source) => source.props.id === "combined-inside-mask-19631009",
            )?.props.shape;
        const polygonWithCutout =
            combinedMaskShape.features[0].geometry.coordinates.find(
                (polygon: number[][][]) => polygon.length > 1,
            );
        const [outerRing, firstCutoutRing] = polygonWithCutout;

        expect(combinedMask).toBeTruthy();
        expect(combinedMask?.props.style.fillOpacity).toBeLessThan(
            playAreaMask?.props.style.fillOpacity,
        );
        expect(combinedMaskShape.features[0].geometry.type).toBe(
            "MultiPolygon",
        );
        expect(polygonWithCutout).toBeTruthy();
        expect(signedRingArea(outerRing)).toBeGreaterThan(0);
        expect(signedRingArea(firstCutoutRing)).toBeLessThan(0);
    });

    it("fits the camera when the map finishes loading", () => {
        const screen = renderWithSafeArea(<NativeMap />);

        fireEvent(screen.getByTestId("native-map"), "onDidFinishLoadingMap");

        expect(__cameraMethods.setCamera).toHaveBeenCalledWith({
            animationDuration: 700,
            animationMode: "easeTo",
            bounds: {
                ne: [139.9189004, 35.8174937],
                paddingBottom: 405,
                paddingLeft: 40,
                paddingRight: 40,
                paddingTop: 167,
                sw: [139.5628986, 35.4816556],
            },
        });
    });

    it("locates the user and flies the camera to the mocked coordinate", async () => {
        const screen = renderWithSafeArea(<NativeMap />);

        fireEvent.press(screen.getByText("📍"));

        await waitFor(() => {
            expect(
                Location.requestForegroundPermissionsAsync,
            ).toHaveBeenCalled();
            expect(__cameraMethods.setCamera).toHaveBeenCalledWith({
                animationDuration: 700,
                animationMode: "flyTo",
                centerCoordinate: [139.6503, 35.6762],
                zoomLevel: 13,
            });
        });
    });

    it("passes scrollEnabled to the map view", () => {
        const screen = renderWithSafeArea(<NativeMap />);

        const mapView = screen.getByTestId("native-map");
        expect(mapView.props.scrollEnabled).toBe(true);
    });

    it("renders the movable pin as ShapeSource layers with stable ids", () => {
        const screen = renderWithSafeArea(<NativeMap />);

        const pinSource = screen
            .getAllByTestId("map-shape-source")
            .find((s) => s.props.id === "question-active-pin");
        expect(pinSource).toBeTruthy();

        const dragLayer = screen
            .getAllByTestId("map-circle-layer")
            .find((l) => l.props.id === "question-active-pin-drag-glow");
        expect(dragLayer).toBeTruthy();
        expect(dragLayer?.props.style.circleBlur).toBeGreaterThan(0);
        expect(dragLayer?.props.style.circleStrokeWidth).toBeUndefined();

        const images = screen
            .getAllByTestId("map-images")
            .find((l) => l.props.images["question-pin"]);
        expect(images).toBeTruthy();

        const iconLayer = screen
            .getAllByTestId("map-symbol-layer")
            .find((l) => l.props.id === "question-active-pin-icon");
        expect(iconLayer).toBeTruthy();
        expect(iconLayer?.props.style.iconImage).toBe("question-pin");
    });
});

describe("movable pin regression", () => {
    const excluded = [
        "PointAnnotation",
        "ViewAnnotation",
        "MarkerView",
        "Marker",
    ];

    it("does not import PointAnnotation, ViewAnnotation, MarkerView, or Marker in NativeMap", () => {
        const { readFileSync } = require("fs");
        const { resolve } = require("path");
        const source = readFileSync(
            resolve(process.cwd(), "src", "features", "map", "NativeMap.tsx"),
            "utf-8",
        );
        for (const name of excluded) {
            expect(source).not.toContain(name);
        }
    });
});
