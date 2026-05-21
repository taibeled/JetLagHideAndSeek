import {
    Camera,
    MapView,
    setAccessToken,
    UserLocation,
} from "@maplibre/maplibre-react-native";
import { useCallback, useMemo, useRef } from "react";
import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import {
    useSafeAreaFrame,
    useSafeAreaInsets,
} from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

import { useHidingZone } from "@/state/hidingZoneStore";
import { updateRadarQuestionCenter, useQuestion } from "@/state/questionStore";
import { usePlayArea } from "@/state/playAreaStore";

import { ActivePinLayer } from "./ActivePinLayer";
import {
    type CameraHandle,
    fitCameraToBbox,
    getTopViewportFitPadding,
} from "./camera";
import { getEventCoordinate } from "./eventCoordinate";
import { HidingZoneLayers } from "./HidingZoneLayers";
import { MapControls } from "./MapControls";
import { buildOsmRasterStyleJson } from "./mapStyle";
import {
    asSeparateMaskConstraints,
    buildCombinedEligibilityMask,
    buildPlayAreaMask,
} from "./maskBuilder";
import { PlayAreaBoundaryLayer } from "./PlayAreaBoundaryLayer";
import {
    CombinedInsideMaskLayer,
    PlayAreaOutsideMaskLayer,
} from "./PlayAreaMaskLayers";
import { RadarQuestionLayers } from "./RadarQuestionLayers";
import { usePinDrag } from "./usePinDrag";
import { useUserLocation } from "./useUserLocation";

setAccessToken(null);

const MLMapView = MapView as ComponentType<any>;
const MLCamera = Camera as ComponentType<any>;
const MLUserLocation = UserLocation as ComponentType<any>;

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
        questionMapRenderState,
        updateQuestion,
    } = useQuestion();
    const { playArea } = usePlayArea();

    const playAreaMask = useMemo(
        () => buildPlayAreaMask(playArea.boundary),
        [playArea.boundary],
    );
    const combinedInsideMask = useMemo(() => {
        return buildCombinedEligibilityMask(
            playArea.boundary,
            [
                zoneFeatures,
                ...asSeparateMaskConstraints(
                    questionMapRenderState.radar.hitMaskFeatures,
                ),
            ],
            [questionMapRenderState.radar.missMaskFeatures],
        );
    }, [
        playArea.boundary,
        zoneFeatures,
        questionMapRenderState.radar.hitMaskFeatures,
        questionMapRenderState.radar.missMaskFeatures,
    ]);
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

    const shouldShowActivePin = Boolean(
        isQuestionSheetActive && activeQuestion?.type === "radar",
    );
    const canMoveActivePin =
        isQuestionSheetActive &&
        !isPinLocked &&
        activeQuestion?.type === "radar";
    const radarActiveQuestion =
        activeQuestion?.type === "radar" ? activeQuestion : null;

    const handlePinCommit = useCallback(
        (questionId: string, center: [number, number]) => {
            updateQuestion(questionId, (question) =>
                updateRadarQuestionCenter(question, center),
            );
        },
        [updateQuestion],
    );

    const pinDrag = usePinDrag({
        activeQuestion: radarActiveQuestion,
        canMove: canMoveActivePin,
        mapRef,
        onCommit: handlePinCommit,
    });

    const activePinFeature = useMemo(
        () =>
            shouldShowActivePin && activeQuestion
                ? {
                      features: [
                          {
                              geometry: {
                                  coordinates:
                                      pinDrag.draftCoordinate ??
                                      (activeQuestion.type === "radar"
                                          ? activeQuestion.center
                                          : [0, 0]),
                                  type: "Point" as const,
                              },
                              properties: {
                                  id: activeQuestion.id,
                                  isDragging: pinDrag.isDragging,
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
            pinDrag.draftCoordinate,
            pinDrag.isDragging,
            pinDrag.revision,
            shouldShowActivePin,
        ],
    );

    const handleMapPress = useCallback(
        (event?: unknown) => {
            const coordinate = getEventCoordinate(event);
            if (canMoveActivePin && coordinate && activeQuestion) {
                const questionId = activeQuestion.id;
                setTimeout(() => {
                    updateQuestion(questionId, (question) =>
                        updateRadarQuestionCenter(question, coordinate),
                    );
                }, 0);
            }
            onPress?.(event);
        },
        [activeQuestion, canMoveActivePin, onPress, updateQuestion],
    );

    return (
        <GestureDetector gesture={pinDrag.gesture}>
            <View style={styles.container}>
                <MLMapView
                    attributionEnabled
                    compassEnabled
                    logoEnabled={false}
                    mapStyle={mapStyle}
                    onDidFinishLoadingMap={fitPlayArea}
                    onPress={handleMapPress}
                    ref={mapRef}
                    scrollEnabled={!pinDrag.isDragging}
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

                    <PlayAreaOutsideMaskLayer
                        osmId={playArea.osmId}
                        playAreaMask={playAreaMask}
                    />
                    <HidingZoneLayers
                        routeFeatures={routeFeatures}
                        stationFeatures={stationFeatures}
                        zoneFeatures={zoneFeatures}
                    />
                    <CombinedInsideMaskLayer
                        combinedInsideMask={combinedInsideMask}
                        osmId={playArea.osmId}
                    />
                    <RadarQuestionLayers
                        onPress={handleMapPress}
                        radar={questionMapRenderState.radar}
                    />
                    <PlayAreaBoundaryLayer playArea={playArea} />

                    {hasLocationPermission ? (
                        <MLUserLocation
                            minDisplacement={5}
                            onUpdate={handleLocationUpdate}
                            visible
                        />
                    ) : null}

                    <ActivePinLayer
                        canMove={canMoveActivePin}
                        feature={activePinFeature}
                        onPress={handleMapPress}
                        pinDrag={pinDrag}
                    />
                </MLMapView>

                <View style={[styles.topBar, { paddingTop: insets.top }]}>
                    <Text style={styles.title}>{playArea.label}</Text>
                </View>

                <MapControls
                    fitPlayArea={fitPlayArea}
                    locateUser={locateUser}
                    topInset={insets.top}
                />
            </View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.background,
    },
    map: {
        flex: 1,
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
