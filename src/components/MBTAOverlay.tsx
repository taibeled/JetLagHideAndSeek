import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useState } from "react";
import {
    isLoading,
    mbtaData,
    mbtaRoutes,
    mbtaStops,
    updateMbtaRouteData,
    updateMbtaStopData,
} from "@/lib/mbta/context";
import { mbtaClient } from "@/lib/mbta/mbta";
import { LIGHT_HEAVY_RAIL_TYPES } from "@/lib/mbta/constants";
import { decodePolyline } from "@/lib/mbta/utils";
import { Marker, Polyline, Popup, Tooltip, useMap } from "react-leaflet";
import type { Stop } from "@/lib/mbta/types";
import { Icon } from "leaflet";

const routeIdColorMap = {
    "Green-B": "green",
    "Green-C": "green",
    "Green-D": "green",
    "Green-E": "green",
    Blue: "blue",
    Orange: "orange",
    Red: "red",
    Mattapan: "red",
};

const ZoomAwareMarker = ({
    position,
    label,
    minZoom,
    color,
    children,
    ...props
}) => {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());

    useEffect(() => {
        const handleZoom = () => {
            setZoom(map.getZoom());
        };

        map.on("zoomend", handleZoom);
        return () => {
            map.off("zoomend", handleZoom);
        };
    }, [map]);

    return (
        <Marker position={position} {...props}>
            {zoom >= minZoom && (
                <Tooltip
                    permanent
                    direction="top"
                    className="font-semibold"
                    offset={[0, -5]}
                >
                    {label}
                </Tooltip>
            )}
            {children}
        </Marker>
    );
};

export const MBTAOverlay = ({ className }: { className?: string }) => {
    const $isLoading = useStore(isLoading);
    const $mbtaRoutes = useStore(mbtaRoutes);
    const $mbtaData = useStore(mbtaData);
    const $mbtaStops = useStore(mbtaStops);

    const allStopsNoDuplicates = useMemo(() => {
        const allStops: any = [];
        const stopNames = new Set();
        const stops = mbtaStops.get();

        Object.entries(stops).forEach(([routeId, stops]) => {
            for (const stop of stops) {
                if (stop.name in stopNames) {
                    continue;
                }
                stopNames.add(stop.name);
                allStops.push({
                    route: routeId,
                    ...stop,
                });
            }
        });

        return allStops;
    }, [$mbtaStops]);

    const fetchPolyline = async (routeId: string) => {
        const currentData = mbtaData.get();

        if (!currentData[routeId]) {
            const response: any = await mbtaClient.fetchShapes({
                route: routeId,
            });
            const filteredData = response.data.filter(
                (item: any) =>
                    !item.id.includes("canonical") && !/[a-zA-Z]/.test(item.id),
            );
            const decodedShapeData = filteredData.map((shape: any) =>
                decodePolyline(shape.attributes.polyline),
            );
            updateMbtaRouteData(routeId, decodedShapeData);
        }
    };

    const fetchStops = async (routeId: string) => {
        const currentStops = mbtaStops.get();

        if (!currentStops || !currentStops.length) {
            const response: any = await mbtaClient.fetchStops({
                route: routeId,
            });
            const stopsData: Stop[] = response.data.map((s: any) => ({
                name: s.attributes.name,
                lat: s.attributes.latitude,
                lng: s.attributes.longitude,
                description: s.attributes.address,
            }));
            updateMbtaStopData(routeId, stopsData);
        }
    };

    const fetchRoutesAndPolylines = async () => {
        const currentRoutes = mbtaRoutes.get();

        if (!currentRoutes || !currentRoutes.length) {
            const routes: any = await mbtaClient.fetchRoutes({
                type: LIGHT_HEAVY_RAIL_TYPES,
            });
            mbtaRoutes.set(routes.data);
            await Promise.all(
                routes.data.map((route: any) =>
                    Promise.all([
                        fetchPolyline(route.id),
                        fetchStops(route.id),
                    ]),
                ),
            );
        }
    };

    useEffect(() => {
        (async () => {
            try {
                isLoading.set(true);
                fetchRoutesAndPolylines();
            } catch (err) {
            } finally {
                isLoading.set(false);
            }
        })();
    }, []);

    useEffect(() => {
        $mbtaRoutes.forEach((route) => {
            fetchPolyline(route.id);
        });
    }, [$mbtaRoutes]);

    if ($isLoading) {
        return null;
    }

    return (
        <>
            {Object.entries($mbtaData).map(([routeId, positions]) => {
                return (
                    <Polyline
                        key={`${routeId}-${positions}`}
                        positions={positions}
                        stroke
                        pathOptions={{ color: routeIdColorMap[routeId] }}
                        fill={false}
                    />
                );
            })}
            {allStopsNoDuplicates.map((stop: any) => {
                const routeId = stop.route;
                const color = routeIdColorMap[routeId];
                return (
                    <ZoomAwareMarker
                        key={`${routeId}-${stop.name}`}
                        position={[stop.lat, stop.lng]}
                        label={stop.name}
                        color={color}
                        minZoom={15}
                        icon={
                            new Icon({
                                iconUrl: `https://upload.wikimedia.org/wikipedia/commons/6/64/MBTA.svg`,
                                iconSize: [15, 25],
                            })
                        }
                    >
                        <Popup>
                            <h3 className="text-center font-semibold">
                                {stop.name}
                            </h3>
                            <p>{stop.description}</p>
                        </Popup>
                    </ZoomAwareMarker>
                );
            })}
        </>
    );
};
