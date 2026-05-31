import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import osmtogeojson from "osmtogeojson";
import type { ReactElement } from "react";
import { Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { hidingZonePresets } from "@/features/hidingZone/hidingZoneData";
import { defaultPlayArea } from "@/features/map/playArea";
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

function getMapFillLayer(screen: ReturnType<typeof render>, id: string) {
    const layer = screen
        .getAllByTestId("map-fill-layer")
        .find((fillLayer) => fillLayer.props.id === id);

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

async function pressAddRadarQuestion(screen: ReturnType<typeof render>) {
    await act(async () => {
        fireEvent.press(screen.getByTestId("add-radar-question-row"));
    });
    act(() => {
        jest.advanceTimersByTime(300);
    });
    await waitFor(() => {
        expect(screen.getByText("Radar Question")).toBeTruthy();
    });
}

function pressAndAdvance(screen: ReturnType<typeof render>, testID: string) {
    fireEvent.press(screen.getByTestId(testID));
    act(() => {
        jest.advanceTimersByTime(300);
    });
}

function openQuestionActions(screen: ReturnType<typeof render>) {
    fireEvent.press(screen.getByTestId("question-actions-menu-button"));
    expect(screen.getByTestId("question-actions-menu")).toBeTruthy();
}

async function pressAddTransitLineQuestion(screen: ReturnType<typeof render>) {
    pressAndAdvance(screen, "add-matching-question-row");
    expect(screen.getByLabelText("Matching")).toBeTruthy();

    pressAndAdvance(screen, "add-matching-transit-line-row");
    await waitFor(() => {
        expect(
            screen.getByTestId("matching-answer-option-unanswered"),
        ).toBeTruthy();
    });
}

describe("MapAppScreen", () => {
    beforeEach(async () => {
        jest.useRealTimers();
        jest.clearAllMocks();
        clearPlayAreaMemoryCache();
        await AsyncStorage.clear();
        mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
        globalThis.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({ elements: [] }),
            ok: true,
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("renders the native map and bottom sheet", () => {
        const screen = renderWithSafeArea(<MapAppScreen />);

        expect(screen.getByTestId("native-map")).toBeTruthy();
        expect(screen.getByTestId("bottom-sheet")).toBeTruthy();
        expect(screen.getByText("Game Setup")).toBeTruthy();
    });

    it("hides the sheet opener from accessibility while the sheet covers it", () => {
        const screen = renderWithSafeArea(<MapAppScreen />);

        expect(screen.queryByLabelText("Open bottom sheet")).toBeNull();

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", -1);

        expect(screen.getByLabelText("Open bottom sheet")).toBeTruthy();
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
        expect(screen.getByTestId("settings-share-button")).toBeTruthy();

        act(() => {
            jest.advanceTimersByTime(300);
        });

        // After transition: leaving screen removed
        expect(screen.queryByText("Game Setup")).toBeNull();
        expect(screen.getByTestId("settings-share-button")).toBeTruthy();

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
        expect(screen.getByLabelText("Hiding Zones")).toBeTruthy();

        // Back: hiding-zone → settings
        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByTestId("settings-share-button")).toBeTruthy();

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
        expect(screen.getByTestId("settings-share-button")).toBeTruthy();
        expect(screen.queryByText("Game Setup")).toBeNull();

        jest.useRealTimers();
    });

    it("keeps bottom-sheet navigation working", () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByText("Questions"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByLabelText("Questions")).toBeTruthy();
        expect(screen.getByTestId("questions-empty-card")).toBeTruthy();

        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByLabelText("Add Question")).toBeTruthy();
        expect(screen.getByTestId("add-radar-question-row")).toBeTruthy();
        expect(screen.getByTestId("add-matching-question-row")).toBeTruthy();

        fireEvent.press(screen.getByTestId("add-matching-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByLabelText("Matching")).toBeTruthy();
        expect(
            screen.getByTestId("add-matching-transit-line-row"),
        ).toBeTruthy();

        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByLabelText("Add Question")).toBeTruthy();

        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("main-settings-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(screen.getByTestId("settings-share-button")).toBeTruthy();
        expect(screen.getByTestId("settings-play-area-row")).toBeTruthy();
        expect(screen.getByTestId("settings-hiding-zone-row")).toBeTruthy();
    });

    it("creates a radar question at the current location and renders its radar preview", async () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddRadarQuestion(screen);

        expect(screen.getByText("Radar Question")).toBeTruthy();
        expect(screen.getByText("500m")).toBeTruthy();
        expect(screen.getByText("1km")).toBeTruthy();
        expect(screen.getByText("2km")).toBeTruthy();
        expect(screen.getByText("5km")).toBeTruthy();
        expect(screen.getByText("10km")).toBeTruthy();
        expect(screen.getByText("Other")).toBeTruthy();
        expect(
            screen.getByTestId("radar-answer-option-unanswered"),
        ).toBeTruthy();
        expect(screen.getByTestId("radar-answer-option-positive")).toBeTruthy();
        expect(screen.getByTestId("radar-answer-option-negative")).toBeTruthy();
        expect(screen.getByTestId("question-actions-menu-button")).toBeTruthy();
        expect(screen.queryByTestId("radar-set-to-location-button")).toBeNull();
        openQuestionActions(screen);
        expect(
            screen.getByTestId("question-actions-set-location"),
        ).toBeTruthy();
        expect(screen.getByTestId("question-actions-lock-toggle")).toBeTruthy();
        expect(screen.getByText("Lock pin")).toBeTruthy();
        expect(screen.getByTestId("question-actions-delete")).toBeTruthy();
        fireEvent.press(screen.getByTestId("question-actions-cancel"));
        expect(screen.queryByTestId("question-actions-menu")).toBeNull();
        expect(
            screen.getByTestId("radar-distance-meters").props.children,
        ).toEqual(["Current distance ", 500, " m"]);
        expect(
            screen.getByTestId("radar-center-summary").props.children,
        ).toEqual(["35.67620", ",", " ", "139.65030"]);
        expect(
            getMapShapeSource(screen, "question-active-pin").props.shape
                .features[0].geometry.coordinates,
        ).toEqual([139.6503, 35.6762]);

        const radarShape = getMapShapeSource(screen, "radar-question-areas")
            .props.shape;
        expect(radarShape.features).toHaveLength(1);
        expect(radarShape.features[0].properties.distanceMeters).toBe(500);
        expect(
            screen
                .getAllByTestId("map-shape-source")
                .some((s) => s.props.id === "combined-inside-mask-19631009"),
        ).toBe(false);
        expect(
            screen
                .getAllByTestId("map-shape-source")
                .some((s) => s.props.id === "radar-question-miss-mask"),
        ).toBe(false);
        expect(
            getMapShapeSource(screen, "radar-question-outlines").props.shape
                .features,
        ).toHaveLength(1);

        fireEvent.press(screen.getByTestId("radar-answer-option-positive"));
        expect(
            screen.getByTestId("radar-answer-option-positive").props
                .accessibilityState,
        ).toEqual({ selected: true });
        expect(
            getMapShapeSource(screen, "radar-question-areas").props.shape
                .features,
        ).toHaveLength(0);
        expect(
            getMapShapeSource(screen, "combined-inside-mask-19631009").props
                .shape.features,
        ).toHaveLength(1);
        expect(
            screen
                .getAllByTestId("map-shape-source")
                .some((s) => s.props.id === "radar-question-miss-mask"),
        ).toBe(false);

        fireEvent.press(screen.getByTestId("radar-answer-option-negative"));
        expect(
            getMapShapeSource(screen, "combined-inside-mask-19631009").props
                .shape.features,
        ).toHaveLength(1);
        expect(
            screen
                .getAllByTestId("map-shape-source")
                .some((s) => s.props.id === "radar-question-miss-mask"),
        ).toBe(false);

        fireEvent.press(screen.getByTestId("radar-answer-option-unanswered"));
        expect(
            getMapShapeSource(screen, "radar-question-areas").props.shape
                .features,
        ).toHaveLength(1);

        fireEvent.press(screen.getByTestId("radar-distance-option-1km"));
        expect(
            screen.getByTestId("radar-distance-meters").props.children,
        ).toEqual(["Current distance ", 1000, " m"]);
        expect(
            getMapShapeSource(screen, "radar-question-areas").props.shape
                .features[0].properties.distanceMeters,
        ).toBe(1000);

        fireEvent.press(screen.getByTestId("radar-distance-option-other"));
        expect(
            screen.getByTestId("radar-distance-custom-input").props.value,
        ).toBe("");
        expect(
            screen.getByTestId("radar-distance-custom-empty-help"),
        ).toBeTruthy();

        fireEvent.changeText(
            screen.getByTestId("radar-distance-custom-input"),
            "750",
        );
        expect(
            screen.getByTestId("radar-distance-custom-input").props.value,
        ).toBe("750");
        expect(
            screen.getByTestId("radar-distance-meters").props.children,
        ).toEqual(["Current distance ", 750, " m"]);

        fireEvent.changeText(
            screen.getByTestId("radar-distance-custom-input"),
            "",
        );
        expect(
            screen.getByTestId("radar-distance-custom-input").props.value,
        ).toBe("");
        expect(
            screen.getByTestId("radar-distance-meters").props.children,
        ).toEqual(["Current distance ", 750, " m"]);
    });

    it("creates a transit line question through the matching sub sheet", async () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddTransitLineQuestion(screen);

        expect(
            screen.getByTestId("matching-answer-option-unanswered"),
        ).toBeTruthy();
        expect(
            screen.getByTestId("matching-answer-option-positive").props
                .accessibilityState,
        ).toEqual({ disabled: true, selected: false });
        expect(
            screen.getByTestId("matching-answer-option-negative").props
                .accessibilityState,
        ).toEqual({ disabled: true, selected: false });
        expect(screen.getByTestId("transit-line-center-summary")).toBeTruthy();
        expect(
            screen.queryByTestId("transit-line-set-to-location-button"),
        ).toBeNull();
        expect(
            getMapShapeSource(screen, "question-active-pin").props.shape
                .features[0].geometry.coordinates,
        ).toEqual(defaultPlayArea.center);

        openQuestionActions(screen);
        await act(async () => {
            fireEvent.press(
                screen.getByTestId("question-actions-set-location"),
            );
        });
        await waitFor(() => {
            expect(
                getMapShapeSource(screen, "question-active-pin").props.shape
                    .features[0].geometry.coordinates,
            ).toEqual([139.6503, 35.6762]);
        });

        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });

        expect(screen.getByLabelText("Questions")).toBeTruthy();
        expect(screen.getByText("Matching 1")).toBeTruthy();
        expect(screen.getByText("Transit line: not selected")).toBeTruthy();
    });

    it("uses a carousel for radar distance options at preview snaps and a grid at the large snap", async () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddRadarQuestion(screen);

        expect(
            screen.getByTestId("radar-distance-option-carousel"),
        ).toBeTruthy();
        expect(screen.queryByTestId("radar-distance-option-grid")).toBeNull();

        fireEvent.press(screen.getByTestId("radar-distance-option-1km"));
        expect(
            screen.getByTestId("radar-distance-meters").props.children,
        ).toEqual(["Current distance ", 1000, " m"]);
        expect(
            getMapShapeSource(screen, "radar-question-areas").props.shape
                .features[0].properties.distanceMeters,
        ).toBe(1000);

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", 2);
        expect(screen.getByTestId("radar-distance-option-grid")).toBeTruthy();
        expect(
            screen.queryByTestId("radar-distance-option-carousel"),
        ).toBeNull();

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", 0);
        expect(
            screen.getByTestId("radar-distance-option-carousel"),
        ).toBeTruthy();
        expect(screen.queryByTestId("radar-distance-option-grid")).toBeNull();
    });

    it("creates a radar question at the play-area center when location is unavailable", async () => {
        jest.mocked(Location.getCurrentPositionAsync).mockRejectedValueOnce(
            new Error("Cannot obtain current location"),
        );
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddRadarQuestion(screen);

        expect(screen.getByText("Radar Question")).toBeTruthy();
        expect(
            getMapShapeSource(screen, "question-active-pin").props.shape
                .features[0].geometry.coordinates,
        ).toEqual(defaultPlayArea.center);
        expect(
            screen.getByTestId("radar-center-summary").props.children,
        ).toEqual([
            defaultPlayArea.center[1].toFixed(5),
            ",",
            " ",
            defaultPlayArea.center[0].toFixed(5),
        ]);
    });

    it("deletes a radar question from the detail sheet", async () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddRadarQuestion(screen);

        expect(
            getMapShapeSource(screen, "radar-question-areas").props.shape
                .features,
        ).toHaveLength(1);

        openQuestionActions(screen);
        fireEvent.press(screen.getByTestId("question-actions-delete"));
        act(() => {
            jest.advanceTimersByTime(300);
        });

        expect(screen.getByLabelText("Questions")).toBeTruthy();
        expect(screen.getByTestId("questions-empty-card")).toBeTruthy();
        expect(
            getMapShapeSource(screen, "radar-question-areas").props.shape
                .features,
        ).toHaveLength(0);
    });

    it("deletes a radar question from the question list swipe action", async () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddRadarQuestion(screen);

        fireEvent.press(screen.getByTestId("radar-answer-option-positive"));
        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });

        expect(screen.getByLabelText("Questions")).toBeTruthy();
        expect(screen.getByText("Radar Question 1")).toBeTruthy();
        expect(screen.getByText("500 m distance · Hit")).toBeTruthy();

        fireEvent.press(screen.getByText("Delete"));

        expect(screen.queryByText("Radar Question 1")).toBeNull();
        expect(screen.getByTestId("questions-empty-card")).toBeTruthy();
        expect(
            getMapShapeSource(screen, "radar-question-areas").props.shape
                .features,
        ).toHaveLength(0);
    });

    it("moves only the active radar pin source while the question sheet is open and unlocked", async () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddRadarQuestion(screen);

        fireEvent(screen.getByTestId("native-map"), "onPress", {
            geometry: { coordinates: [139.75, 35.7] },
        });
        await waitFor(() => {
            expect(
                getMapShapeSource(screen, "question-active-pin").props.shape
                    .features[0].geometry.coordinates,
            ).toEqual([139.75, 35.7]);
        });

        openQuestionActions(screen);
        await act(async () => {
            fireEvent.press(
                screen.getByTestId("question-actions-set-location"),
            );
        });
        await waitFor(() => {
            expect(
                getMapShapeSource(screen, "question-active-pin").props.shape
                    .features[0].geometry.coordinates,
            ).toEqual([139.6503, 35.6762]);
        });

        jest.mocked(Location.getCurrentPositionAsync).mockRejectedValueOnce(
            new Error("Cannot obtain current location"),
        );
        fireEvent(screen.getByTestId("native-map"), "onPress", {
            geometry: { coordinates: [139.8, 35.71] },
        });
        await waitFor(() => {
            expect(
                getMapShapeSource(screen, "question-active-pin").props.shape
                    .features[0].geometry.coordinates,
            ).toEqual([139.8, 35.71]);
        });

        openQuestionActions(screen);
        await act(async () => {
            fireEvent.press(
                screen.getByTestId("question-actions-set-location"),
            );
        });
        expect(
            getMapShapeSource(screen, "question-active-pin").props.shape
                .features[0].geometry.coordinates,
        ).toEqual([139.8, 35.71]);

        fireEvent.press(screen.getByText("Back"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        expect(
            getMapShapeSource(screen, "question-active-pin").props.shape
                .features,
        ).toHaveLength(0);
    });

    it("keeps the active radar pin fixed when locked", async () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddRadarQuestion(screen);

        const initialCoordinate = getMapShapeSource(
            screen,
            "question-active-pin",
        ).props.shape.features[0].geometry.coordinates;

        openQuestionActions(screen);
        fireEvent.press(screen.getByTestId("question-actions-lock-toggle"));
        expect(screen.queryByTestId("question-actions-menu")).toBeNull();

        openQuestionActions(screen);
        expect(
            screen.getByTestId("question-actions-lock-toggle").props
                .accessibilityState,
        ).toEqual({ selected: true });
        expect(screen.getByText("Unlock pin")).toBeTruthy();
        fireEvent.press(screen.getByTestId("question-actions-cancel"));

        fireEvent(screen.getByTestId("native-map"), "onPress", {
            geometry: { coordinates: [139.75, 35.7] },
        });
        act(() => {
            jest.runOnlyPendingTimers();
        });

        expect(
            getMapShapeSource(screen, "question-active-pin").props.shape
                .features[0].geometry.coordinates,
        ).toEqual(initialCoordinate);
    });

    it("shows nearest selected station distance in the radar info box", async () => {
        jest.useFakeTimers();
        const screen = renderWithSafeArea(<MapAppScreen />);

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
        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddRadarQuestion(screen);

        await waitFor(() => {
            expect(
                String(
                    screen.getByTestId("radar-info-box").props
                        .accessibilityLabel,
                ),
            ).toContain("from ");
        });
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
            ).toBe(false);
            expect(
                getMapFillLayer(screen, "combined-inside-mask-fill-19631009")
                    .props.style.fillOpacity,
            ).toBeLessThan(
                getMapFillLayer(screen, "play-area-outside-mask-fill-19631009")
                    .props.style.fillOpacity,
            );
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

    it("tapping the map when the sheet is at index 2 (88%) snaps to index 0 (18%)", () => {
        const { __bottomSheetMethods } =
            require("@gorhom/bottom-sheet") as unknown as {
                __bottomSheetMethods: { snapToIndex: jest.Mock };
            };
        const screen = renderWithSafeArea(<MapAppScreen />);

        // Navigate to play-area; the useEffect auto-snaps to index 2 (88%).
        fireEvent.press(screen.getByTestId("main-settings-row"));
        fireEvent.press(screen.getByTestId("settings-play-area-row"));

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", 2);

        // Fire map press
        fireEvent(screen.getByTestId("native-map"), "onPress", {
            geometry: { coordinates: [0, 0] },
        });

        expect(__bottomSheetMethods.snapToIndex).toHaveBeenCalledWith(0);
    });

    it("does NOT snap when map is tapped at index 1 (42%)", () => {
        const { __bottomSheetMethods } =
            require("@gorhom/bottom-sheet") as unknown as {
                __bottomSheetMethods: { snapToIndex: jest.Mock };
            };
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", 1);
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

    it("dismisses the keyboard when the sheet snaps compact or closes", () => {
        const keyboardDismiss = jest.spyOn(Keyboard, "dismiss");
        const screen = renderWithSafeArea(<MapAppScreen />);

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", 1);
        expect(keyboardDismiss).not.toHaveBeenCalled();

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", 0);
        expect(keyboardDismiss).toHaveBeenCalledTimes(1);

        fireEvent(screen.getByTestId("bottom-sheet"), "onChange", -1);
        expect(keyboardDismiss).toHaveBeenCalledTimes(2);

        keyboardDismiss.mockRestore();
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

    // -- Drag gesture integration tests --

    async function navigateToUnlockedQuestionSheet(
        screen: ReturnType<typeof render>,
    ) {
        jest.useFakeTimers();
        fireEvent.press(screen.getByTestId("main-questions-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        fireEvent.press(screen.getByTestId("questions-add-question-row"));
        act(() => {
            jest.advanceTimersByTime(300);
        });
        await pressAddRadarQuestion(screen);
    }

    function cleanupMovePinTest() {
        jest.restoreAllMocks();
        jest.useRealTimers();
    }

    async function navigateToMovePinAndUseRealTimers(
        screen: ReturnType<typeof render>,
    ) {
        await navigateToUnlockedQuestionSheet(screen);
        jest.useRealTimers();
    }

    describe("pin drag gesture", () => {
        beforeEach(async () => {
            jest.clearAllMocks();
            clearPlayAreaMemoryCache();
            await AsyncStorage.clear();
            mockedOsmToGeoJson.mockReturnValue(osakaBoundary);
            globalThis.fetch = jest.fn().mockResolvedValue({
                json: jest.fn().mockResolvedValue({ elements: [] }),
                ok: true,
            });
            jest.spyOn(
                globalThis as any,
                "requestAnimationFrame",
            ).mockImplementation((cb: any) => {
                const id = Math.random();
                Promise.resolve().then(() => cb(0));
                return id;
            });
            jest.spyOn(
                globalThis as any,
                "cancelAnimationFrame",
            ).mockImplementation(jest.fn());
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it("tapping the map to move the pin works while the sheet is unlocked", async () => {
            const screen = renderWithSafeArea(<MapAppScreen />);
            await navigateToUnlockedQuestionSheet(screen);

            fireEvent(screen.getByTestId("native-map"), "onPress", {
                geometry: { coordinates: [139.75, 35.7] },
            });

            act(() => {
                jest.runOnlyPendingTimers();
            });
            await waitFor(() => {
                expect(
                    getMapShapeSource(screen, "question-active-pin").props.shape
                        .features[0].geometry.coordinates,
                ).toEqual([139.75, 35.7]);
            });

            cleanupMovePinTest();
        });

        it("does not start dragging when long-pressing far from the pin", async () => {
            const { __gestureCallbacks } =
                require("react-native-gesture-handler") as unknown as {
                    __gestureCallbacks: Record<string, jest.Mock>;
                };
            const { __mapMethods } =
                require("@maplibre/maplibre-react-native") as unknown as {
                    __mapMethods: {
                        getCoordinateFromView: jest.Mock;
                        getPointInView: jest.Mock;
                    };
                };

            __mapMethods.getPointInView.mockResolvedValue([100, 500]);

            const screen = renderWithSafeArea(<MapAppScreen />);
            await navigateToMovePinAndUseRealTimers(screen);

            expect(__gestureCallbacks.onStart).toBeTruthy();

            const onStartFn =
                __gestureCallbacks.onStart.getMockImplementation();
            if (onStartFn) {
                await act(async () => {
                    await onStartFn({ absoluteX: 300, absoluteY: 500 });
                });
            }

            const mapView = screen.getByTestId("native-map");
            expect(mapView.props.scrollEnabled).toBe(true);

            cleanupMovePinTest();
        });

        it("starts dragging when long-pressing near the pin", async () => {
            const { __gestureCallbacks } =
                require("react-native-gesture-handler") as unknown as {
                    __gestureCallbacks: Record<string, jest.Mock>;
                };
            const { __mapMethods } =
                require("@maplibre/maplibre-react-native") as unknown as {
                    __mapMethods: {
                        getCoordinateFromView: jest.Mock;
                        getPointInView: jest.Mock;
                    };
                };

            __mapMethods.getPointInView.mockResolvedValue([100, 500]);

            const screen = renderWithSafeArea(<MapAppScreen />);
            await navigateToMovePinAndUseRealTimers(screen);

            const onStartFn =
                __gestureCallbacks.onStart.getMockImplementation();
            if (onStartFn) {
                await act(async () => {
                    await onStartFn({ absoluteX: 105, absoluteY: 502 });
                });
            }

            await waitFor(() => {
                expect(
                    screen.getByTestId("native-map").props.scrollEnabled,
                ).toBe(false);
            });

            cleanupMovePinTest();
        });

        it("updates draft pin coordinate during drag", async () => {
            const { __gestureCallbacks } =
                require("react-native-gesture-handler") as unknown as {
                    __gestureCallbacks: Record<string, jest.Mock>;
                };
            const { __mapMethods } =
                require("@maplibre/maplibre-react-native") as unknown as {
                    __mapMethods: {
                        getCoordinateFromView: jest.Mock;
                        getPointInView: jest.Mock;
                    };
                };

            __mapMethods.getPointInView.mockResolvedValue([100, 500]);
            __mapMethods.getCoordinateFromView.mockResolvedValue([
                139.8, 35.68,
            ]);

            const screen = renderWithSafeArea(<MapAppScreen />);
            await navigateToMovePinAndUseRealTimers(screen);

            // Start drag near pin
            const onStartFn =
                __gestureCallbacks.onStart.getMockImplementation();
            if (onStartFn) {
                await act(async () => {
                    await onStartFn({ absoluteX: 105, absoluteY: 502 });
                });
            }

            // Move finger with onUpdate
            act(() => {
                const onUpdateFn =
                    __gestureCallbacks.onUpdate.getMockImplementation();
                if (onUpdateFn) {
                    onUpdateFn({ absoluteX: 200, absoluteY: 600 });
                }
            });

            // With real timers, requestAnimationFrame will fire
            await waitFor(() => {
                const pinShape = getMapShapeSource(
                    screen,
                    "question-active-pin",
                ).props.shape;
                expect(pinShape.features[0].geometry.coordinates).toEqual([
                    139.8, 35.68,
                ]);
            });

            cleanupMovePinTest();
        });

        it("finalizes the pin coordinate on drag end", async () => {
            const { __gestureCallbacks } =
                require("react-native-gesture-handler") as unknown as {
                    __gestureCallbacks: Record<string, jest.Mock>;
                };
            const { __mapMethods } =
                require("@maplibre/maplibre-react-native") as unknown as {
                    __mapMethods: {
                        getCoordinateFromView: jest.Mock;
                        getPointInView: jest.Mock;
                    };
                };

            __mapMethods.getPointInView.mockResolvedValue([100, 500]);
            __mapMethods.getCoordinateFromView.mockResolvedValue([140.0, 36.0]);

            const screen = renderWithSafeArea(<MapAppScreen />);
            await navigateToMovePinAndUseRealTimers(screen);

            await act(async () => {
                const onStartFn =
                    __gestureCallbacks.onStart.getMockImplementation();
                if (onStartFn) {
                    await onStartFn({ absoluteX: 105, absoluteY: 502 });
                }
            });

            act(() => {
                const onUpdateFn =
                    __gestureCallbacks.onUpdate.getMockImplementation();
                if (onUpdateFn) {
                    onUpdateFn({ absoluteX: 200, absoluteY: 600 });
                }
            });

            // Wait for rAF to flush the draft coordinate update
            await waitFor(() => {
                const pinShape = getMapShapeSource(
                    screen,
                    "question-active-pin",
                ).props.shape;
                expect(pinShape.features[0].geometry.coordinates).toEqual([
                    140.0, 36.0,
                ]);
            });

            await act(async () => {
                const onEndFn =
                    __gestureCallbacks.onEnd.getMockImplementation();
                if (onEndFn) {
                    await onEndFn();
                }
            });

            await waitFor(() => {
                const pinShape = getMapShapeSource(
                    screen,
                    "question-active-pin",
                ).props.shape;
                expect(pinShape.features[0].geometry.coordinates).toEqual([
                    140.0, 36.0,
                ]);
            });

            const mapView = screen.getByTestId("native-map");
            expect(mapView.props.scrollEnabled).toBe(true);

            cleanupMovePinTest();
        });

        it("clears draft pin and re-enables panning when sheet closes", async () => {
            const { __gestureCallbacks } =
                require("react-native-gesture-handler") as unknown as {
                    __gestureCallbacks: Record<string, jest.Mock>;
                };
            const { __mapMethods } =
                require("@maplibre/maplibre-react-native") as unknown as {
                    __mapMethods: {
                        getCoordinateFromView: jest.Mock;
                        getPointInView: jest.Mock;
                    };
                };

            __mapMethods.getPointInView.mockResolvedValue([100, 500]);

            const screen = renderWithSafeArea(<MapAppScreen />);
            await navigateToMovePinAndUseRealTimers(screen);

            await act(async () => {
                const onStartFn =
                    __gestureCallbacks.onStart.getMockImplementation();
                if (onStartFn) {
                    await onStartFn({ absoluteX: 105, absoluteY: 502 });
                }
            });
            await waitFor(() => {
                expect(
                    screen.getByTestId("native-map").props.scrollEnabled,
                ).toBe(false);
            });

            // Navigate back (closing question detail) - use fake timers for sheet transition
            jest.useFakeTimers();
            fireEvent.press(screen.getByText("Back"));
            act(() => {
                jest.advanceTimersByTime(300);
            });

            // Back on add-question screen, the lock preference is still unlocked,
            // but canMoveActivePin is false because isQuestionSheetActive is false.
            const mapView = screen.getByTestId("native-map");
            expect(mapView.props.scrollEnabled).toBe(true);

            // Pin source should be empty since isQuestionSheetActive is false
            // Navigate further back to prove full cleanup
            fireEvent.press(screen.getByText("Back"));
            act(() => {
                jest.advanceTimersByTime(300);
            });

            expect(
                getMapShapeSource(screen, "question-active-pin").props.shape
                    .features,
            ).toHaveLength(0);

            cleanupMovePinTest();
        });

        it("ignores drag gesture when the question sheet is not open", () => {
            const screen = renderWithSafeArea(<MapAppScreen />);

            const mapView = screen.getByTestId("native-map");
            expect(mapView.props.scrollEnabled).toBe(true);

            expect(mapView.props.scrollEnabled).toBe(true);
        });
    });
});
