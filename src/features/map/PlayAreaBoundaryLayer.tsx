import { colors } from "@/theme/colors";

import type { PlayArea } from "./playArea";

import { MLLineLayer, MLShapeSource } from "./mapLibrePrimitives";

type PlayAreaBoundaryLayerProps = {
    playArea: PlayArea;
};

export function PlayAreaBoundaryLayer({
    playArea,
}: PlayAreaBoundaryLayerProps) {
    return (
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
    );
}
