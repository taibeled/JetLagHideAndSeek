import { colors } from "@/theme/colors";

import type {
    RouteFeatureCollection,
    StationFeatureCollection,
    ZoneFeatureCollection,
} from "@/features/hidingZone/hidingZoneTypes";

import {
    MLCircleLayer,
    MLLineLayer,
    MLShapeSource,
} from "./mapLibrePrimitives";

const MAX_STATION_COLOR_RINGS = 6;
const ROUTE_MIN_ZOOM = 9;
const STATION_MIN_ZOOM = 12;

type HidingZoneLayersProps = {
    routeFeatures: RouteFeatureCollection;
    stationFeatures: StationFeatureCollection;
    zoneFeatures: ZoneFeatureCollection;
};

export function HidingZoneLayers({
    routeFeatures,
    stationFeatures,
    zoneFeatures,
}: HidingZoneLayersProps) {
    return (
        <>
            <MLShapeSource id="hiding-zone-area" shape={zoneFeatures}>
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
                    minZoomLevel={ROUTE_MIN_ZOOM}
                    style={{
                        lineCap: "round",
                        lineColor: ["to-color", ["get", "color"], colors.tint],
                        lineJoin: "round",
                        lineOpacity: 0.9,
                        lineWidth: [
                            "interpolate",
                            ["linear"],
                            ["zoom"],
                            6,
                            1,
                            10,
                            2,
                            13,
                            4,
                            16,
                            7,
                        ],
                    }}
                />
            </MLShapeSource>

            <MLShapeSource id="hiding-zone-stations" shape={stationFeatures}>
                {Array.from(
                    { length: MAX_STATION_COLOR_RINGS },
                    (_, index) => MAX_STATION_COLOR_RINGS - index - 1,
                ).map((ringIndex) => (
                    <MLCircleLayer
                        filter={["==", ["get", "ringIndex"], ringIndex]}
                        id={`hiding-zone-stations-ring-${ringIndex}`}
                        key={ringIndex}
                        minZoomLevel={STATION_MIN_ZOOM}
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
        </>
    );
}
