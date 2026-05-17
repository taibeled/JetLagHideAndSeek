import type { Bbox, Position } from "./geojsonTypes";

export type MapLibreBounds = {
    ne: Position;
    sw: Position;
};

export type CameraPadding = {
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
};

export type CameraHandle = {
    fitBounds?: (
        ne: Position,
        sw: Position,
        padding?: number,
        animationDuration?: number,
    ) => void;
    setCamera?: (config: {
        animationDuration?: number;
        animationMode?: "flyTo" | "easeTo" | "linearTo" | "moveTo";
        bounds?: MapLibreBounds & Partial<CameraPadding>;
        centerCoordinate?: Position;
        zoomLevel?: number;
    }) => void;
};

export function bboxToMapLibreBounds([
    west,
    south,
    east,
    north,
]: Bbox): MapLibreBounds {
    return {
        ne: [east, north],
        sw: [west, south],
    };
}

export function fitCameraToBbox(
    camera: CameraHandle | null | undefined,
    bbox: Bbox,
    padding: number | CameraPadding = 72,
    animationDuration = 700,
) {
    const { ne, sw } = bboxToMapLibreBounds(bbox);

    if (typeof padding === "number") {
        camera?.fitBounds?.(ne, sw, padding, animationDuration);
        return;
    }

    camera?.setCamera?.({
        animationDuration,
        animationMode: "easeTo",
        bounds: {
            ne,
            sw,
            ...padding,
        },
    });
}

export function getTopViewportFitPadding({
    height,
    topInset,
}: {
    height: number;
    topInset: number;
}): CameraPadding {
    return {
        paddingBottom: Math.round(height * 0.48),
        paddingLeft: 40,
        paddingRight: 40,
        paddingTop: Math.round(topInset + 120),
    };
}

export function flyCameraToCoordinate(
    camera: CameraHandle | null | undefined,
    centerCoordinate: Position,
    zoomLevel = 13,
) {
    camera?.setCamera?.({
        animationDuration: 700,
        animationMode: "flyTo",
        centerCoordinate,
        zoomLevel,
    });
}
