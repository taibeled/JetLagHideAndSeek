import {
    Camera,
    CircleLayer,
    FillLayer,
    Images,
    LineLayer,
    MapView,
    setAccessToken,
    ShapeSource,
    SymbolLayer,
    UserLocation,
} from "@maplibre/maplibre-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import {
    useSafeAreaFrame,
    useSafeAreaInsets,
} from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

import { useHidingZone } from "@/state/hidingZoneStore";
import { useQuestion } from "@/state/questionStore";
import {
    type CameraHandle,
    fitCameraToBbox,
    getTopViewportFitPadding,
} from "./camera";
import type { Position } from "./geojsonTypes";
import { buildOsmRasterStyleJson } from "./mapStyle";
import { useUserLocation } from "./useUserLocation";
import { usePlayArea } from "@/state/playAreaStore";
import radiusQuestionPinImage from "../../../assets/map/radius-question-pin.png";

setAccessToken(null);

const MLMapView = MapView as ComponentType<any>;
const MLCamera = Camera as ComponentType<any>;
const MLShapeSource = ShapeSource as ComponentType<any>;
const MLCircleLayer = CircleLayer as ComponentType<any>;
const MLFillLayer = FillLayer as ComponentType<any>;
const MLImages = Images as ComponentType<any>;
const MLLineLayer = LineLayer as ComponentType<any>;
const MLSymbolLayer = SymbolLayer as ComponentType<any>;
const MLUserLocation = UserLocation as ComponentType<any>;
const MAX_STATION_COLOR_RINGS = 6;

type NativeMapProps = {
    onPress?: (event?: unknown) => void;
};

export function NativeMap({ onPress }: NativeMapProps) {
    const cameraRef = useRef<CameraHandle | null>(null);
    const mapRef = useRef<any>(null);
    const insets = useSafeAreaInsets();
    const { height } = useSafeAreaFrame();
    const { routeFeatures, stationFeatures, zoneFeatures } = useHidingZone();
    const {
        activeQuestion,
        isPinLocked,
        isQuestionSheetActive,
        radiusFeatures,
        setQuestionCenter,
    } = useQuestion();
    const { playArea } = usePlayArea();

    const [isDraggingMovePin, setIsDraggingMovePin] = useState(false);
    const isDraggingRef = useRef(false);
    const draftPinCoordinateRef = useRef<Position | null>(null);
    const rafRef = useRef<number | null>(null);
    const [tick, setTick] = useState(0);
    const draftCoordinate = isDraggingMovePin
        ? draftPinCoordinateRef.current
        : null;
    const radiusQuestionPinImages = useMemo(
        () => ({ "radius-question-pin": radiusQuestionPinImage }),
        [],
    );
    const mapStyle = useMemo(() => buildOsmRasterStyleJson(), []);
    const fitPadding = useMemo(
        () =>
            getTopViewportFitPadding({
                height,
                topInset: insets.top,
            }),
        [height, insets.top],
    );
    const { handleLocationUpdate, hasLocationPermission, locateUser } =
        useUserLocation(cameraRef);

    const fitPlayArea = useCallback(() => {
        fitCameraToBbox(cameraRef.current, playArea.bbox, fitPadding);
    }, [fitPadding, playArea.bbox]);

    const fitLabel = "🗺️";
    const shouldShowActivePin = Boolean(
        isQuestionSheetActive && activeQuestion,
    );
    const canMoveActivePin =
        isQuestionSheetActive && !isPinLocked && Boolean(activeQuestion);

    const cleanupDrag = useCallback(() => {
        isDraggingRef.current = false;
        setIsDraggingMovePin(false);
        draftPinCoordinateRef.current = null;
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!canMoveActivePin) {
            cleanupDrag();
        }
    }, [canMoveActivePin, cleanupDrag]);

    useEffect(() => {
        return () => {
            cleanupDrag();
        };
    }, [cleanupDrag]);

    const updateDraftCoordinate = useCallback(
        (screenX: number, screenY: number) => {
            if (rafRef.current !== null) return;
            rafRef.current = requestAnimationFrame(async () => {
                rafRef.current = null;
                try {
                    const coordinate =
                        await mapRef.current?.getCoordinateFromView([
                            screenX,
                            screenY,
                        ]);
                    if (isDraggingRef.current && coordinate) {
                        draftPinCoordinateRef.current = coordinate;
                        setTick((t) => t + 1);
                    }
                } catch {
                    // ignore projection errors during drag
                }
            });
        },
        [],
    );

    const handleDragStart = useCallback(
        async (absoluteX: number, absoluteY: number) => {
            const pinCoord = activeQuestion?.center;
            if (!pinCoord || !mapRef.current) {
                isDraggingRef.current = false;
                return;
            }
            try {
                const screenPoint: [number, number] =
                    await mapRef.current.getPointInView(pinCoord);
                const dx = absoluteX - screenPoint[0];
                const dy = absoluteY - screenPoint[1];
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= 50) {
                    isDraggingRef.current = true;
                    setIsDraggingMovePin(true);
                } else {
                    isDraggingRef.current = false;
                }
            } catch {
                isDraggingRef.current = false;
            }
        },
        [activeQuestion],
    );

    const handleDragUpdate = useCallback(
        (absoluteX: number, absoluteY: number) => {
            if (!isDraggingRef.current) return;
            updateDraftCoordinate(absoluteX, absoluteY);
        },
        [updateDraftCoordinate],
    );

    const handleDragEnd = useCallback(() => {
        if (
            isDraggingRef.current &&
            draftPinCoordinateRef.current &&
            activeQuestion?.id
        ) {
            setQuestionCenter(activeQuestion.id, draftPinCoordinateRef.current);
        }
        cleanupDrag();
    }, [activeQuestion, setQuestionCenter, cleanupDrag]);

    const handleDragFinalize = useCallback(() => {
        cleanupDrag();
    }, [cleanupDrag]);

    const pinDragGesture = useMemo(() => {
        return Gesture.Pan()
            .activateAfterLongPress(300)
            .enabled(canMoveActivePin)
            .onStart((event: any) => {
                runOnJS(handleDragStart)(event.absoluteX, event.absoluteY);
            })
            .onUpdate((event: any) => {
                runOnJS(handleDragUpdate)(event.absoluteX, event.absoluteY);
            })
            .onEnd(() => {
                runOnJS(handleDragEnd)();
            })
            .onFinalize(() => {
                runOnJS(handleDragFinalize)();
            });
    }, [
        canMoveActivePin,
        handleDragStart,
        handleDragUpdate,
        handleDragEnd,
        handleDragFinalize,
    ]);

    const activePinFeature = useMemo(
        () =>
            shouldShowActivePin && activeQuestion
                ? {
                      features: [
                          {
                              geometry: {
                                  coordinates:
                                      draftCoordinate ?? activeQuestion.center,
                                  type: "Point" as const,
                              },
                              properties: {
                                  id: activeQuestion.id,
                                  isDragging: isDraggingMovePin,
                                  isUnlocked: canMoveActivePin,
                              },
                              type: "Feature" as const,
                          },
                      ],
                      type: "FeatureCollection" as const,
                  }
                : { features: [], type: "FeatureCollection" as const },
        [
            activeQuestion,
            canMoveActivePin,
            draftCoordinate,
            isDraggingMovePin,
            shouldShowActivePin,
            tick,
        ],
    );

    const handleMapPress = useCallback(
        (event?: unknown) => {
            const coordinate = getEventCoordinate(event);
            if (canMoveActivePin && coordinate && activeQuestion) {
                const questionId = activeQuestion.id;
                setTimeout(() => {
                    setQuestionCenter(questionId, coordinate);
                }, 0);
            }
            onPress?.(event);
        },
        [activeQuestion, canMoveActivePin, onPress, setQuestionCenter],
    );

    return (
        <GestureDetector gesture={pinDragGesture}>
            <View style={styles.container}>
                <MLMapView
                    attributionEnabled
                    compassEnabled
                    logoEnabled={false}
                    mapStyle={mapStyle}
                    onDidFinishLoadingMap={fitPlayArea}
                    onPress={handleMapPress}
                    ref={mapRef}
                    scrollEnabled={!isDraggingMovePin}
                    style={styles.map}
                    testID="native-map"
                >
                    <MLCamera
                        ref={cameraRef}
                        defaultSettings={{
                            centerCoordinate: playArea.center,
                            zoomLevel: 4,
                        }}
                    />

                    <MLShapeSource id="hiding-zone-area" shape={zoneFeatures}>
                        <MLFillLayer
                            id="hiding-zone-area-fill"
                            style={{
                                fillColor: colors.tint,
                                fillOpacity: 0.16,
                            }}
                        />
                        <MLLineLayer
                            id="hiding-zone-area-outline"
                            style={{
                                lineColor: colors.tint,
                                lineOpacity: 0.55,
                                lineWidth: 1.5,
                            }}
                        />
                    </MLShapeSource>

                    <MLShapeSource
                        id="radius-question-areas"
                        onPress={handleMapPress}
                        shape={radiusFeatures}
                    >
                        <MLFillLayer
                            id="radius-question-areas-fill"
                            style={{
                                fillColor: "#e46f4d",
                                fillOpacity: 0.16,
                            }}
                        />
                        <MLLineLayer
                            id="radius-question-areas-outline"
                            style={{
                                lineColor: "#e46f4d",
                                lineOpacity: 0.8,
                                lineWidth: 2,
                            }}
                        />
                    </MLShapeSource>

                    <MLShapeSource
                        id="hiding-zone-routes"
                        shape={routeFeatures}
                    >
                        <MLLineLayer
                            id="hiding-zone-routes-line"
                            style={{
                                lineCap: "round",
                                lineColor: [
                                    "to-color",
                                    ["get", "color"],
                                    colors.tint,
                                ],
                                lineJoin: "round",
                                lineOpacity: 0.9,
                                lineWidth: 4,
                            }}
                        />
                    </MLShapeSource>

                    <MLShapeSource
                        id="hiding-zone-stations"
                        shape={stationFeatures}
                    >
                        {Array.from(
                            { length: MAX_STATION_COLOR_RINGS },
                            (_, index) => MAX_STATION_COLOR_RINGS - index - 1,
                        ).map((ringIndex) => (
                            <MLCircleLayer
                                filter={["==", ["get", "ringIndex"], ringIndex]}
                                id={`hiding-zone-stations-ring-${ringIndex}`}
                                key={ringIndex}
                                style={{
                                    circleColor: [
                                        "to-color",
                                        ["get", "color"],
                                        colors.tint,
                                    ],
                                    circleOpacity: 0.95,
                                    circleRadius: 5 + ringIndex * 3,
                                    circleStrokeColor: colors.white,
                                    circleStrokeWidth: 1.5,
                                }}
                            />
                        ))}
                    </MLShapeSource>

                    <MLShapeSource
                        id={`play-area-boundary-${playArea.osmId}`}
                        shape={playArea.boundary}
                    >
                        <MLLineLayer
                            id={`play-area-boundary-line-${playArea.osmId}`}
                            style={{
                                lineColor: colors.tint,
                                lineOpacity: 0.95,
                                lineWidth: 3,
                            }}
                        />
                    </MLShapeSource>

                    {hasLocationPermission ? (
                        <MLUserLocation
                            minDisplacement={5}
                            onUpdate={handleLocationUpdate}
                            visible
                        />
                    ) : null}

                    <MLImages images={radiusQuestionPinImages} />

                    <MLShapeSource
                        id="radius-question-active-pin"
                        onPress={handleMapPress}
                        shape={activePinFeature}
                    >
                        <MLCircleLayer
                            id="radius-question-active-pin-drag-ring"
                            style={{
                                circleColor: "#e46f4d",
                                circleOpacity: canMoveActivePin ? 0.18 : 0,
                                circleRadius: isDraggingMovePin ? 28 : 22,
                                circleStrokeColor: "#e46f4d",
                                circleStrokeOpacity: canMoveActivePin
                                    ? 0.65
                                    : 0,
                                circleStrokeWidth: isDraggingMovePin ? 3 : 2,
                                circleTranslate: [0, -31],
                            }}
                        />
                        <MLSymbolLayer
                            id="radius-question-active-pin-icon"
                            style={{
                                iconAllowOverlap: true,
                                iconAnchor: "bottom",
                                iconIgnorePlacement: true,
                                iconImage: "radius-question-pin",
                                iconSize: 0.42,
                            }}
                        />
                    </MLShapeSource>
                </MLMapView>

                <View style={[styles.topBar, { paddingTop: insets.top }]}>
                    <Text style={styles.title}>{playArea.label}</Text>
                </View>

                <View
                    style={[
                        styles.controls,
                        {
                            top: insets.top + 60,
                        },
                    ]}
                >
                    <MapControl label={fitLabel} onPress={fitPlayArea} />
                    <MapControl label="📍" onPress={locateUser} />
                </View>
            </View>
        </GestureDetector>
    );
}

type MapControlProps = {
    label: string;
    onPress: () => void;
};

function MapControl({ label, onPress }: MapControlProps) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.controlButton,
                pressed ? styles.controlButtonPressed : null,
            ]}
        >
            <Text style={styles.controlLabel}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.background,
    },
    controlButton: {
        alignItems: "center",
        backgroundColor: colors.white,
        borderColor: "rgba(23, 32, 42, 0.14)",
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 44,
        paddingHorizontal: 12,
        ...Platform.select({
            default: {
                elevation: 5,
                shadowColor: "#000",
                shadowOffset: { height: 4, width: 0 },
                shadowOpacity: 0.14,
                shadowRadius: 10,
            },
            web: {
                boxShadow: "0 4px 10px rgba(0, 0, 0, 0.14)",
            },
        }),
    },
    controlButtonPressed: {
        opacity: 0.72,
    },
    controlLabel: {
        color: colors.ink,
        fontSize: 20,
        fontWeight: "800",
    },
    controls: {
        gap: 8,
        position: "absolute",
        right: 16,
    },
    map: {
        flex: 1,
    },
    subtitle: {
        color: colors.muted,
        fontSize: 14,
        marginTop: 2,
    },
    title: {
        color: colors.ink,
        fontSize: 22,
        fontWeight: "800",
    },
    topBar: {
        left: 0,
        paddingHorizontal: 20,
        position: "absolute",
        top: 0,
    },
});

function getEventCoordinate(event: unknown): [number, number] | null {
    if (!isRecord(event)) return null;

    const nativeEvent = event.nativeEvent;
    if (isRecord(nativeEvent)) {
        const nativeCoordinate = getEventCoordinate(nativeEvent);
        if (nativeCoordinate) return nativeCoordinate;
    }

    const payload = event.payload;
    if (isRecord(payload)) {
        const payloadCoordinate = getEventCoordinate(payload);
        if (payloadCoordinate) return payloadCoordinate;
    }

    const directCoordinates = event.coordinates;
    if (
        isRecord(directCoordinates) &&
        typeof directCoordinates.longitude === "number" &&
        typeof directCoordinates.latitude === "number"
    ) {
        return [directCoordinates.longitude, directCoordinates.latitude];
    }
    if (Array.isArray(directCoordinates)) {
        const coordinate = getCoordinateFromArray(directCoordinates);
        if (coordinate) return coordinate;
    }

    const geometry = event.geometry;
    if (isRecord(geometry) && Array.isArray(geometry.coordinates)) {
        const coordinate = getCoordinateFromArray(geometry.coordinates);
        if (coordinate) return coordinate;
    }

    return null;
}

function getCoordinateFromArray(value: unknown[]): [number, number] | null {
    const [lon, lat] = value;
    if (
        typeof lon === "number" &&
        typeof lat === "number" &&
        Number.isFinite(lon) &&
        Number.isFinite(lat) &&
        Math.abs(lon) <= 180 &&
        Math.abs(lat) <= 90
    ) {
        return [lon, lat];
    }
    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
