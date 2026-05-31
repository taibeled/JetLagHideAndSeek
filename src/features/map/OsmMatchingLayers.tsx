import type { OsmMatchingRenderState } from "@/features/questions/radar/radarTypes";

import { MLCircleLayer, MLShapeSource } from "./mapLibrePrimitives";

type OsmMatchingLayersProps = {
    osmMatching: OsmMatchingRenderState;
};

export function OsmMatchingLayers({ osmMatching }: OsmMatchingLayersProps) {
    const hasPois = osmMatching.poiFeatures.features.length > 0;

    if (!hasPois) {
        return null;
    }

    return (
        <MLShapeSource id="osm-matching-pois" shape={osmMatching.poiFeatures}>
            <MLCircleLayer
                filter={["==", "isSelected", true]}
                id="osm-matching-poi-selected"
                style={{
                    circleColor: "#ffffff",
                    circleRadius: 7,
                    circleStrokeColor: "#e53935",
                    circleStrokeWidth: 2,
                }}
            />
            <MLCircleLayer
                filter={["==", "isSelected", false]}
                id="osm-matching-poi-unselected"
                style={{
                    circleColor: "#ffffff",
                    circleRadius: 6,
                    circleStrokeColor: "#000000",
                    circleStrokeWidth: 1,
                }}
            />
        </MLShapeSource>
    );
}
