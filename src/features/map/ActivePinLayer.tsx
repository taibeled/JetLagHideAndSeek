import { useMemo } from "react";
import type { FeatureCollection, Point } from "geojson";

import questionPinImage from "../../../assets/map/question-pin.png";

import type { PinDragState } from "./usePinDrag";
import {
    MLCircleLayer,
    MLImages,
    MLShapeSource,
    MLSymbolLayer,
} from "./mapLibrePrimitives";

type ActivePinLayerProps = {
    canMove: boolean;
    feature: FeatureCollection<Point>;
    onPress?: (event?: unknown) => void;
    pinDrag: PinDragState;
};

export function ActivePinLayer({
    canMove,
    feature,
    onPress,
    pinDrag,
}: ActivePinLayerProps) {
    const questionPinImages = useMemo(
        () => ({ "question-pin": questionPinImage }),
        [],
    );
    const { isDragging } = pinDrag;

    return (
        <>
            <MLImages images={questionPinImages} />
            <MLShapeSource
                id="question-active-pin"
                onPress={onPress}
                shape={feature}
            >
                <MLCircleLayer
                    id="question-active-pin-drag-glow"
                    style={{
                        circleBlur: 0.75,
                        circleColor: isDragging ? "#ffffff" : "#e46f4d",
                        circleOpacity: canMove ? (isDragging ? 0.42 : 0.3) : 0,
                        circleRadius: isDragging ? 60 : 24,
                        circleTranslate: [0, -31],
                    }}
                />
                <MLSymbolLayer
                    id="question-active-pin-icon"
                    style={{
                        iconAllowOverlap: true,
                        iconAnchor: "bottom",
                        iconIgnorePlacement: true,
                        iconImage: "question-pin",
                        iconSize: 0.42,
                    }}
                />
            </MLShapeSource>
        </>
    );
}
