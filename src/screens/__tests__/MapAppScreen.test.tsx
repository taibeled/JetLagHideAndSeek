import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import osmtogeojson from "osmtogeojson";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { hidingZonePresets } from "@/features/hidingZone/hidingZoneData";
import { clearPlayAreaMemoryCache } from "@/features/map/playAreaBoundary";
import { AppStateProviders } from "@/state/AppStateProviders";

import { MapAppScreen } from "../MapAppScreen";

const EARTH_RADIUS_METERS = 6371008.8;

jest.mock("osmtogeojson", () => ({
    __esModule: true,
    default: jest.fn(),
}));

const mockedOsmToGeoJson = osmtogeojson as jest.MockedFunction<
    typeof osmtogeojson
>;

const osakaBoundary = {
    features: [
        {
            geometry: {
                coordinates: [
                    [
                        [135.35, 34.5],
                        [135.7, 34.5],
                        [135.7, 34.82],
                        [135.35, 34.82],
                        [135.35, 34.5],
                    ],
                ],
                type: "Polygon",
            },
            properties: { name: "Osaka" },
            type: "Feature",
        },
    ],
    type: "FeatureCollection",
};

function getMapShapeSource(screen: ReturnType<typeof render>, id: string) {
    const source = screen
        .getAllByTestId("map-shape-source")
        .find((shapeSource) => shapeSource.props.id === id);

    expect(source).toBeTruthy();
    return source!;
}

function getMapLineLayer(screen: ReturnType<typeof render>, id: string) {
    const layer = screen
        .getAllByTestId("map-line-layer")
        .find((lineLayer) => lineLayer.props.id === id);

    expect(layer).toBeTruthy();
    return layer!;
}

function getMapCircleLayer(screen: ReturnType<typeof render>, id: string) {
    const layer = screen
        .getAllByTestId("map-circle-layer")
        .find((circleLayer) => circleLayer.props.id === id);

    expect(layer).toBeTruthy();
    return layer!;
}

function projectedRingArea(
    coordinates: number[][],
    originLatitude: number,
): number {
    const originLatitudeRadians = (originLatitude * Math.PI) / 180;
    let area = 0;

    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const [lonA, latA] = coordinates[index];
        const [lonB, latB] = coordinates[index + 1];
        const xA =
            EARTH_RADIUS_METERS *
            ((lonA * Math.PI) / 180) *
            Math.cos(originLatitudeRadians);
        const yA = EARTH_RADIUS_METERS * ((latA * Math.PI) / 180);
        const xB =
            EARTH_RADIUS_METERS *
            ((lonB * Math.PI) / 180) *
            Math.cos(originLatitudeRadians);
        const yB = EARTH_RADIUS_METERS * ((latB * Math.PI) / 180);

        area += xA * yB - xB * yA;
    }

    return Math.abs(area) / 2;
}

function polygonAreaMeters(feature: any, originLatitude: number): number {
    if (feature.geometry.type === "Polygon") {
        const [outerRing, ...holes] = feature.geometry.coordinates;
        return (
            projectedRingArea(outerRing, originLatitude) -
            holes.reduce(
                (area: number, ring: number[][]) =>
                    area + projectedRingArea(ring, originLatitude),
                0,
            )
        );
    }

    if (feature.geometry.type === "MultiPolygon") {
        return feature.geometry.coordinates.reduce(
            (area: number, polygon: number[][][]) =>
                area +
                polygonAreaMeters(
                    {
                        geometry: {
                            coordinates: polygon,
                            type: "Polygon",
                        },
                    },
                    originLatitude,
                ),
            0,
        );
    }

    return 0;
}

function renderWithSafeArea(ui: ReactElement) {
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

describe("MapAppScreen", () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        clearPlayAreaMemoryCache();
        await AsyncStorage.clear();
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
        globalThis.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({ elements: [] }),
            ok: true,
        });
    });

    it("renders the native map and bottom sheet", () => {
        const screen = renderWithSafeArea(<MapAppScreen />);

        expect(screen.getByTestId("native-map")).toBeTruthy();
        expect(screen.getByTestId("bottom-sheet")).toBeTruthy();
        expect(screen.getByText("Game Setup")).toBeTruthy();
    });

    it("starts with empty hiding-zone map sources", () => {
        const screen = renderWithSafeArea(<MapAppScreen />);

        expect(
            getMapShapeSource(screen, "hiding-zone-area").props.shape.features,
        ).toHaveLength(0);
        expect(
            getMapShapeSource(screen, "hiding-zone-routes").props.shape
                .features,
        ).toHaveLength(0);
        expect(
            getMapShapeSource(screen, "hiding-zone-stations").props.shape
                .features,
        ).toHaveLength(0);
    });

    it("renders edge-swipe-back slab on sub-screens", () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        expect(() => screen.getByTestId("edge-swipe-back-slab")).toThrow();

        fireEvent.press(screen.getByTestId("main-settings-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByTestId("edge-swipe-back-slab")).toBeTruthy();

        fireEvent.press(screen.getByTestId("settings-play-area-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByTestId("edge-swipe-back-slab")).toBeTruthy();

        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(() => screen.getByTestId("edge-swipe-back-slab")).toThrow();

        jest.useRealTimers();
    });

    it("shows both screens during transition, clears leaving after timeout", () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-settings-row"));

        // During transition: both leaving (main) and current (settings) visible
        expect(screen.getByText("Game Setup")).toBeTruthy();
        expect(screen.getByText("Game Settings")).toBeTruthy();

        act(() => {
            jest.advanceTimersByTime(300);
        });

        // After transition: leaving screen removed
        expect(screen.queryByText("Game Setup")).toBeNull();
        expect(screen.getByText("Game Settings")).toBeTruthy();

        jest.useRealTimers();
    });

    it("maintains correct direction across forward and back navigation cycles", () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        // Forward: main → settings → hiding-zone
        fireEvent.press(screen.getByTestId("main-settings-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("settings-hiding-zone-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByText("Eligible Transit Stations")).toBeTruthy();

        // Back: hiding-zone → settings
        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByText("Game Settings")).toBeTruthy();

        // Back: settings → main
        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByTestId("main-settings-row")).toBeTruthy();

        // Forward again from a previously visited route (the bug scenario)
        fireEvent.press(screen.getByTestId("main-settings-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByText("Game Settings")).toBeTruthy();
        expect(screen.queryByText("Game Setup")).toBeNull();

        jest.useRealTimers();
    });

    it("keeps bottom-sheet navigation working", () => {
        const screen = renderWithSafeArea(<MapAppScreen />);
        jest.useFakeTimers();

        fireEvent.press(screen.getByText("Questions"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByText("Question List")).toBeTruthy();
        expect(screen.getByTestId("questions-empty-card")).toBeTruthy();

        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByText("Add Question"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByText("Choose a question")).toBeTruthy();
        expect(screen.getByTestId("add-radius-question-row")).toBeTruthy();

        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("main-settings-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByText("Game Settings")).toBeTruthy();
        expect(screen.getByTestId("settings-play-area-row")).toBeTruthy();
        expect(screen.getByTestId("settings-hiding-zone-row")).toBeTruthy();

        jest.useRealTimers();
    });

    it("creates a radius question and renders its radius preview", () => {
        const screen = renderWithSafeArea(<MapAppScreen />);
        jest.useFakeTimers();

        fireEvent.press(screen.getByTestId("main-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("add-radius-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });

        expect(screen.getByText("Preview Radius")).toBeTruthy();
        expect(screen.getByText("500m")).toBeTruthy();
        expect(screen.getByText("1km")).toBeTruthy();
        expect(screen.getByText("2km")).toBeTruthy();
        expect(screen.getByText("5km")).toBeTruthy();
        expect(screen.getByText("10km")).toBeTruthy();
        expect(screen.getByText("Other")).toBeTruthy();
        expect(screen.getByTestId("radius-meters").props.children).toEqual([
            "Stored as ",
            500,
            " m",
        ]);

        const radiusShape = getMapShapeSource(screen, "radius-question-areas")
            .props.shape;
        expect(radiusShape.features).toHaveLength(1);
        expect(radiusShape.features[0].properties.radiusMeters).toBe(500);

        fireEvent.press(screen.getByTestId("radius-option-1km"));
        expect(screen.getByTestId("radius-meters").props.children).toEqual([
            "Stored as ",
            1000,
            " m",
        ]);
        expect(
            getMapShapeSource(screen, "radius-question-areas").props.shape
                .features[0].properties.radiusMeters,
        ).toBe(1000);

        jest.useRealTimers();
    });

    it("moves only the active radius pin when move-pin mode is enabled", () => {
        const screen = renderWithSafeArea(<MapAppScreen />);
        jest.useFakeTimers();

        fireEvent.press(screen.getByTestId("main-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("add-radius-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });

        const initialPin = screen.getByTestId("radius-question-pin");
        const initialCoordinate = initialPin.props.coordinate;
        expect(initialPin.props.draggable).toBe(false);

        fireEvent(screen.getByTestId("native-map"), "onPress", {
            geometry: { coordinates: [139.75, 35.7] },
        });
        expect(
            screen.getByTestId("radius-question-pin").props.coordinate,
        ).toEqual(initialCoordinate);

        fireEvent.press(screen.getByTestId("radius-move-pin-button"));
        expect(screen.getByTestId("radius-question-pin").props.draggable).toBe(
            true,
        );

        fireEvent(screen.getByTestId("native-map"), "onPress", {
            geometry: { coordinates: [139.75, 35.7] },
        });
        expect(
            screen.getByTestId("radius-question-pin").props.coordinate,
        ).toEqual([139.75, 35.7]);

        fireEvent(screen.getByTestId("radius-question-pin"), "onDragEnd", {
            geometry: { coordinates: [139.8, 35.72] },
        });
        expect(
            screen.getByTestId("radius-question-pin").props.coordinate,
        ).toEqual([139.8, 35.72]);

        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.queryByTestId("radius-question-pin")).toBeNull();

        jest.useRealTimers();
    });

    it("shows nearest selected station distance in the radius info box", async () => {
        const screen = renderWithSafeArea(<MapAppScreen />);
        jest.useFakeTimers();

        fireEvent.press(screen.getByTestId("main-settings-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("settings-hiding-zone-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("hiding-zone-preset-tokyo-metro"));

        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("main-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("add-radius-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });

        await waitFor(() => {
            expect(
                String(
                    screen.getByTestId("radius-info-box").props
                        .accessibilityLabel,
                ),
            ).toContain("from ");
        });

        jest.useRealTimers();
    });

    it("suggests Tokyo hiding-zone presets without auto-selecting them", () => {
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-settings-row"));
        fireEvent.press(screen.getByTestId("settings-hiding-zone-row"));

        expect(screen.getByText("Suggested presets")).toBeTruthy();
        expect(screen.getByText("Tokyo Metro")).toBeTruthy();
        expect(screen.getByText("Toei Subway")).toBeTruthy();
        expect(screen.getByText("0 presets selected")).toBeTruthy();
        expect(
            screen.getByTestId("hiding-zone-radius-meters").props.children,
        ).toEqual(["Stored as ", 600, " m"]);
    });

    it("adds a hiding-zone preset and renders consistent map sources", async () => {
        const screen = renderWithSafeArea(<MapAppScreen />);
        const tokyoMetro = hidingZonePresets.find(
            (preset) => preset.id === "tokyo-metro",
        );

        expect(tokyoMetro).toBeTruthy();

        fireEvent.press(screen.getByTestId("main-settings-row"));
        fireEvent.press(screen.getByTestId("settings-hiding-zone-row"));
        fireEvent.press(screen.getByTestId("hiding-zone-preset-tokyo-metro"));

        await waitFor(() => {
            const zoneShape = getMapShapeSource(screen, "hiding-zone-area")
                .props.shape;
            const routeShape = getMapShapeSource(screen, "hiding-zone-routes")
                .props.shape;
            const stationShape = getMapShapeSource(
                screen,
                "hiding-zone-stations",
            ).props.shape;

            expect(screen.getByText("1 preset selected")).toBeTruthy();
            expect(screen.getByText("Remove")).toBeTruthy();
            expect(zoneShape.features).toHaveLength(1);
            expect(["Polygon", "MultiPolygon"]).toContain(
                zoneShape.features[0].geometry.type,
            );
            expect(zoneShape.features[0].properties.radiusMeters).toBe(600);
            expect(routeShape.features).toHaveLength(tokyoMetro!.routes.length);
            expect(
                routeShape.features.map((feature: any) => ({
                    color: feature.properties.color,
                    id: feature.properties.id,
                })),
            ).toEqual(
                tokyoMetro!.routes.map((route) => ({
                    color: route.color,
                    id: route.id,
                })),
            );
            expect(
                routeShape.features.some(
                    (feature: any) =>
                        feature.properties.color !== tokyoMetro!.defaultColor,
                ),
            ).toBe(true);
            expect(
                routeShape.features.every(
                    (feature: any) => feature.geometry.coordinates.length > 0,
                ),
            ).toBe(true);
            expect(
                getMapLineLayer(screen, "hiding-zone-routes-line").props.style
                    .lineColor,
            ).toEqual(["to-color", ["get", "color"], "#1f6f78"]);
            expect(
                new Set(
                    stationShape.features.map(
                        (feature: any) => feature.properties.id,
                    ),
                ).size,
            ).toBe(tokyoMetro!.stations.length);
            expect(
                stationShape.features.every(
                    (feature: any) =>
                        typeof feature.properties.color === "string" &&
                        feature.properties.color.startsWith("#") &&
                        feature.properties.ringCount >= 1 &&
                        feature.properties.ringIndex >= 0,
                ),
            ).toBe(true);
            expect(
                stationShape.features.some(
                    (feature: any) =>
                        feature.properties.color !== tokyoMetro!.defaultColor,
                ),
            ).toBe(true);
            expect(
                screen
                    .getAllByTestId("map-circle-layer")
                    .filter((layer) =>
                        String(layer.props.id).startsWith(
                            "hiding-zone-stations-ring-",
                        ),
                    ),
            ).toHaveLength(6);
            const firstStationRing = getMapCircleLayer(
                screen,
                "hiding-zone-stations-ring-0",
            );
            expect(firstStationRing.props.style.circleColor).toEqual([
                "to-color",
                ["get", "color"],
                "#1f6f78",
            ]);
            expect(firstStationRing.props.filter).toEqual([
                "==",
                ["get", "ringIndex"],
                0,
            ]);
            expect(firstStationRing.props.style.circleRadius).toBe(5);
            expect(
                screen
                    .getAllByTestId("map-fill-layer")
                    .some(
                        (layer) => layer.props.id === "hiding-zone-area-fill",
                    ),
            ).toBe(true);
        });
    });

    it("updates rendered hiding-zone polygon area when the radius changes", async () => {
        const screen = renderWithSafeArea(<MapAppScreen />);
        const tokyoMetro = hidingZonePresets.find(
            (preset) => preset.id === "tokyo-metro",
        );

        expect(tokyoMetro).toBeTruthy();

        fireEvent.press(screen.getByTestId("main-settings-row"));
        fireEvent.press(screen.getByTestId("settings-hiding-zone-row"));
        fireEvent.press(screen.getByTestId("hiding-zone-preset-tokyo-metro"));

        await waitFor(() => {
            expect(
                getMapShapeSource(screen, "hiding-zone-area").props.shape
                    .features,
            ).toHaveLength(1);
        });

        const initialFeature = getMapShapeSource(screen, "hiding-zone-area")
            .props.shape.features[0];
        const initialArea = polygonAreaMeters(
            initialFeature,
            tokyoMetro!.stations[0].lat,
        );

        fireEvent.press(screen.getByTestId("hiding-zone-unit-km"));
        fireEvent.changeText(
            screen.getByTestId("hiding-zone-radius-input"),
            "1",
        );

        await waitFor(() => {
            const updatedFeature = getMapShapeSource(screen, "hiding-zone-area")
                .props.shape.features[0];

            expect(updatedFeature.properties.radiusMeters).toBe(1000);
            expect(
                polygonAreaMeters(updatedFeature, tokyoMetro!.stations[0].lat),
            ).toBeGreaterThan(initialArea);
        });
    });

    it("changes radius units while preserving backend meters", () => {
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-settings-row"));
        fireEvent.press(screen.getByTestId("settings-hiding-zone-row"));
        fireEvent.press(screen.getByTestId("hiding-zone-unit-km"));

        expect(screen.getByTestId("hiding-zone-radius-input").props.value).toBe(
            "0.60",
        );

        fireEvent.changeText(
            screen.getByTestId("hiding-zone-radius-input"),
            "1",
        );
        expect(
            screen.getByTestId("hiding-zone-radius-meters").props.children,
        ).toEqual(["Stored as ", 1000, " m"]);
    });

    it("applies an Osaka play area from a direct OSM relation ID", async () => {
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-settings-row"));
        fireEvent.press(screen.getByTestId("settings-play-area-row"));
        fireEvent.changeText(
            screen.getByTestId("play-area-relation-id-text-input"),
            "358674",
        );
        fireEvent.press(screen.getByTestId("play-area-apply-relation-button"));

        await waitFor(() => {
            expect(screen.getAllByText("Osaka").length).toBeGreaterThan(0);
            expect(screen.getByText("🗺️")).toBeTruthy();
            expect(screen.getByText("Relation 358674")).toBeTruthy();
        });
    });

    it("tapping the map when the sheet is at index 1 (88%) snaps to index 0 (42%)", () => {
        const { __bottomSheetMethods } =
            require("@gorhom/bottom-sheet") as unknown as {
                __bottomSheetMethods: { snapToIndex: jest.Mock };
            };
        const screen = renderWithSafeArea(<MapAppScreen />);

        // Navigate to play-area — the useEffect auto-snaps to index 1 (88%)
        fireEvent.press(screen.getByTestId("main-settings-row"));
        fireEvent.press(screen.getByTestId("settings-play-area-row"));

        // Simulate the sheet settling at index 1
        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", 1);

        // Fire map press
        fireEvent(screen.getByTestId("native-map"), "onPress", {
            geometry: { coordinates: [0, 0] },
        });

        expect(__bottomSheetMethods.snapToIndex).toHaveBeenCalledWith(0);
    });

    it("does NOT snap when map is tapped at index 0 (42%)", () => {
        const { __bottomSheetMethods } =
            require("@gorhom/bottom-sheet") as unknown as {
                __bottomSheetMethods: { snapToIndex: jest.Mock };
            };
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", 0);
        __bottomSheetMethods.snapToIndex.mockClear();

        fireEvent(screen.getByTestId("native-map"), "onPress", {
            geometry: { coordinates: [0, 0] },
        });

        expect(__bottomSheetMethods.snapToIndex).not.toHaveBeenCalled();
    });

    it("does NOT snap when map is tapped while sheet is closed (index -1)", () => {
        const { __bottomSheetMethods } =
            require("@gorhom/bottom-sheet") as unknown as {
                __bottomSheetMethods: { snapToIndex: jest.Mock };
            };
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", -1);
        __bottomSheetMethods.snapToIndex.mockClear();

        fireEvent(screen.getByTestId("native-map"), "onPress", {
            geometry: { coordinates: [0, 0] },
        });

        expect(__bottomSheetMethods.snapToIndex).not.toHaveBeenCalled();
    });

    it("shows direct relation validation errors without fetching", async () => {
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-settings-row"));
        fireEvent.press(screen.getByTestId("settings-play-area-row"));
        fireEvent.changeText(
            screen.getByTestId("play-area-relation-id-text-input"),
            "not-a-relation",
        );
        fireEvent.press(screen.getByTestId("play-area-apply-relation-button"));

        await waitFor(() => {
            expect(
                screen.getByText("Enter a positive OSM relation ID."),
            ).toBeTruthy();
            expect(
                screen.getAllByText("Tokyo 23 Wards").length,
            ).toBeGreaterThan(0);
        });
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("keeps Tokyo selected when relation loading fails", async () => {
        (globalThis.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
        });
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-settings-row"));
        fireEvent.press(screen.getByTestId("settings-play-area-row"));
        fireEvent.changeText(
            screen.getByTestId("play-area-relation-id-text-input"),
            "999999",
        );
        fireEvent.press(screen.getByTestId("play-area-apply-relation-button"));

        await waitFor(() => {
            expect(screen.getByText("Overpass API error 500")).toBeTruthy();
            expect(
                screen.getAllByText("Tokyo 23 Wards").length,
            ).toBeGreaterThan(0);
            expect(screen.getByText("🗺️")).toBeTruthy();
        });
    });
});
