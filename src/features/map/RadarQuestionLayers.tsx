import type { RadarQuestionRenderState } from "@/features/questions/radar/radarTypes";

import { MLFillLayer, MLLineLayer, MLShapeSource } from "./mapLibrePrimitives";

type RadarQuestionLayersProps = {
    onPress?: (event?: unknown) => void;
    radar: RadarQuestionRenderState;
};

export function RadarQuestionLayers({
    onPress,
    radar,
}: RadarQuestionLayersProps) {
    return (
        <>
            <MLShapeSource
                id="radar-question-areas"
                onPress={onPress}
                shape={radar.previewFeatures}
            >
                <MLFillLayer
                    id="radar-question-areas-fill"
                    style={{
                        fillColor: "#e46f4d",
                        fillOpacity: 0.16,
                    }}
                />
            </MLShapeSource>

            <MLShapeSource
                id="radar-question-outlines"
                onPress={onPress}
                shape={radar.outlineFeatures}
            >
                <MLLineLayer
                    id="radar-question-areas-outline"
                    style={{
                        lineColor: "#e46f4d",
                        lineOpacity: 0.8,
                        lineWidth: 2,
                    }}
                />
            </MLShapeSource>
        </>
    );
}
