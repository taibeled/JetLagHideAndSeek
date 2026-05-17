import {
    Camera,
    CircleLayer,
    FillLayer,
    LineLayer,
    MapView,
    setAccessToken,
    ShapeSource,
    UserLocation,
} from "@maplibre/maplibre-react-native";
import { useCallback, useMemo, useRef } from "react";
import type { ComponentType } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
    useSafeAreaFrame,
    useSafeAreaInsets,
} from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

import { useHidingZone } from "@/state/hidingZoneStore";
import {
    type CameraHandle,
    fitCameraToBbox,
    getTopViewportFitPadding,
} from "./camera";
import { buildOsmRasterStyleJson } from "./mapStyle";
import { useUserLocation } from "./useUserLocation";
import { usePlayArea } from "@/state/playAreaStore";

setAccessToken(null);

const MLMapView = MapView as ComponentType<any>;
const MLCamera = Camera as ComponentType<any>;
const MLShapeSource = ShapeSource as ComponentType<any>;
const MLCircleLayer = CircleLayer as ComponentType<any>;
const MLFillLayer = FillLayer as ComponentType<any>;
const MLLineLayer = LineLayer as ComponentType<any>;
const MLUserLocation = UserLocation as ComponentType<any>;
const MAX_STATION_COLOR_RINGS = 6;

type NativeMapProps = {
    onPress?: () => void;
};

export function NativeMap({ onPress }: NativeMapProps) {
    const cameraRef = useRef<CameraHandle | null>(null);
    const insets = useSafeAreaInsets();
    const { height } = useSafeAreaFrame();
    const { routeFeatures, stationFeatures, zoneFeatures } = useHidingZone();
    const { playArea } = usePlayArea();
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

    return (
        <View style={styles.container}>
            <MLMapView
                attributionEnabled
                compassEnabled
                logoEnabled={false}
                mapStyle={mapStyle}
                onDidFinishLoadingMap={fitPlayArea}
                onPress={onPress}
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

                <MLShapeSource id="hiding-zone-routes" shape={routeFeatures}>
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
            </MLMapView>

            <View style={[styles.topBar, { paddingTop: insets.top }]}>
                <Text style={styles.title}>{playArea.label}</Text>
            </View>

            <View
                style={[
                    styles.controls,
                    {
                        top: insets.top + 16,
                    },
                ]}
            >
                <MapControl label={fitLabel} onPress={fitPlayArea} />
                <MapControl label="📍" onPress={locateUser} />
            </View>
        </View>
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
