import type { GeoJsonFeatureCollection } from "./geojsonTypes";
import { MLFillLayer, MLShapeSource } from "./mapLibrePrimitives";

type PlayAreaOutsideMaskLayerProps = {
    osmId: number;
    playAreaMask: GeoJsonFeatureCollection;
};

export function PlayAreaOutsideMaskLayer({
    osmId,
    playAreaMask,
}: PlayAreaOutsideMaskLayerProps) {
    return (
        <MLShapeSource
            id={`play-area-outside-mask-${osmId}`}
            shape={playAreaMask}
        >
            <MLFillLayer
                id={`play-area-outside-mask-fill-${osmId}`}
                style={{
                    fillColor: "#07111f",
                    fillOpacity: 0.58,
                }}
            />
        </MLShapeSource>
    );
}

type CombinedInsideMaskLayerProps = {
    combinedInsideMask: GeoJsonFeatureCollection;
    osmId: number;
};

export function CombinedInsideMaskLayer({
    combinedInsideMask,
    osmId,
}: CombinedInsideMaskLayerProps) {
    if (combinedInsideMask.features.length === 0) {
        return null;
    }

    return (
        <MLShapeSource
            id={`combined-inside-mask-${osmId}`}
            shape={combinedInsideMask}
        >
            <MLFillLayer
                id={`combined-inside-mask-fill-${osmId}`}
                style={{
                    fillColor: "#07111f",
                    fillOpacity: 0.35,
                }}
            />
        </MLShapeSource>
    );
}
