import "leaflet/dist/leaflet.css";
import "leaflet-contextmenu/dist/leaflet.contextmenu.css";
import { MapContainer, TileLayer } from "react-leaflet";
import { geoJSON, type Map as LeafletMap } from "leaflet";
import "leaflet-contextmenu";
import { cn } from "../lib/utils";
import {
    defaultUnit,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    questions,
} from "../utils/context";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import * as turf from "@turf/turf";
import { determineGeoJSON, type OpenStreetMap } from "../maps/api";
import { adjustPerRadius } from "../maps/radius";
import { DraggableMarkers } from "./DraggableMarkers";
import { adjustPerThermometer } from "../maps/thermometer";
import { adjustPerTentacle } from "../maps/tentacles";
import { adjustPerMatching } from "../maps/matching";
import { PolygonDraw } from "./PolygonDraw";
import { adjustPerMeasuring } from "@/maps/measuring";
import { iconColors } from "../maps/api";

export const refreshMapData = (
    $mapGeoLocation: OpenStreetMap,
    screen: boolean = true,
    map?: LeafletMap
) => {
    const refresh = async () => {
        const mapGeoData = await determineGeoJSON(
            $mapGeoLocation.properties.osm_id.toString(),
            $mapGeoLocation.properties.osm_type
        );

        mapGeoJSON.set(mapGeoData);

        if (screen) {
            if (!map) return;
            focusMap(map, mapGeoData);
        }

        return mapGeoData;
    };

    return toast.promise(
        refresh().catch((error) => console.log(error)),
        {
            pending: "Refreshing map data...",
            error: "Error refreshing map data",
        }
    );
};

export const Map = ({ className }: { className?: string }) => {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $questions = useStore(questions);
    const map = useStore(leafletMapContext);
    const [reset, setReset] = useState(0);

    const addRadius = (e: { latlng: any }) => {
        const center = e.latlng
        console.log(`Current coordinates: ${center.lat}, ${center.lng}`);
        const currentQuestions = questions.get();

        questions.set([
            ...currentQuestions,
            {
                id: "radius",
                key: Math.random() * 1e9,
                data: {
                    radius: 50,
                    unit: defaultUnit.get(),
                    lat: center.lat,
                    lng: center.lng,
                    within: false,
                    color: Object.keys(iconColors)[
                        Math.floor(
                            Math.random() *
                            Object.keys(
                                iconColors
                            ).length
                        )
                    ] as keyof typeof iconColors,
                    drag: true,
                },
            },
        ]);
    };

    const addThermometer = (e: { latlng: any }) => {
        const center = e.latlng
        console.log(`Current coordinates: ${center.lat}, ${center.lng}`);
        const currentQuestions = questions.get();

        const destination = turf.destination(
            [center.lng, center.lat],
            5,
            90,
            {
                units: "miles",
            }
        );

        questions.set([
            ...currentQuestions,
            {
                id: "thermometer",
                key: Math.random() * 1e9,
                data: {
                    colorA: Object.keys(iconColors)[
                        Math.floor(
                            Math.random() *
                            Object.keys(
                                iconColors
                            ).length
                        )
                    ] as keyof typeof iconColors,
                    colorB: Object.keys(iconColors)[
                        Math.floor(
                            Math.random() *
                            Object.keys(
                                iconColors
                            ).length
                        )
                    ] as keyof typeof iconColors,
                    latA: center.lat,
                    lngA: center.lng,
                    latB: destination.geometry
                        .coordinates[1],
                    lngB: destination.geometry
                        .coordinates[0],
                    distance: 5,
                    warmer: true,
                    drag: true,
                },
            },
        ]);
    };

    const addTentacles = (e: { latlng: any }) => {
        const center = e.latlng
        console.log(`Current coordinates: ${center.lat}, ${center.lng}`);
        const currentQuestions = questions.get();

        questions.set([
            ...currentQuestions,
            {
                id: "tentacles",
                key: Math.random() * 1e9,
                data: {
                    color: Object.keys(iconColors)[
                        Math.floor(
                            Math.random() *
                                Object.keys(
                                    iconColors
                                ).length
                        )
                    ] as keyof typeof iconColors,
                    lat: center.lat,
                    unit: defaultUnit.get(),
                    lng: center.lng,
                    drag: true,
                    location: false,
                    locationType: "theme_park",
                    radius: 15,
                },
            },
        ]);
    }

    const addMatching = (e: { latlng: any }) => {
        const center = e.latlng
        console.log(`Current coordinates: ${center.lat}, ${center.lng}`);
        const currentQuestions = questions.get();

        questions.set([
            ...currentQuestions,
            {
                id: "matching",
                key: Math.random() * 1e9,
                data: {
                    color: Object.keys(iconColors)[
                        Math.floor(
                            Math.random() *
                                Object.keys(
                                    iconColors
                                ).length
                        )
                    ] as keyof typeof iconColors,
                    lat: center.lat,
                    lng: center.lng,
                    drag: true,
                    same: true,
                    type: "zone",
                    cat: {
                        adminLevel: 3,
                    },
                },
            },
        ]);
    }

    const addMeasuring = (e: { latlng: any }) => {
        const center = e.latlng
        console.log(`Current coordinates: ${center.lat}, ${center.lng}`);
        const currentQuestions = questions.get();

        questions.set([
            ...currentQuestions,
            {
                id: "measuring",
                key: Math.random() * 1e9,
                data: {
                    color: Object.keys(iconColors)[
                        Math.floor(
                            Math.random() *
                                Object.keys(
                                    iconColors
                                ).length
                        )
                    ] as keyof typeof iconColors,
                    lat: center.lat,
                    lng: center.lng,
                    drag: true,
                    hiderCloser: true,
                    type: "coastline",
                },
            },
        ]);
    }

    const refreshQuestionsBase = async (focus: boolean = false) => {
        if (!map) return;

        let mapGeoData = mapGeoJSON.get();

        if (!mapGeoData) {
            const polyGeoData = polyGeoJSON.get();
            if (polyGeoData) {
                mapGeoData = polyGeoData;
                mapGeoJSON.set(polyGeoData);
            } else {
                mapGeoData = await refreshMapData($mapGeoLocation, false, map);
            }
        }

        try {
            for (let index = 0; index < $questions.length; index++) {
                const question = $questions[index];

                switch (question?.id) {
                    case "radius":
                        if (!question.data.within) break;
                        mapGeoData = adjustPerRadius(
                            question.data,
                            mapGeoData,
                            false
                        );
                        break;
                    case "thermometer":
                        mapGeoData = adjustPerThermometer(
                            question.data,
                            mapGeoData,
                            false
                        );
                        break;
                    case "tentacles":
                        if (question.data.location === false) break;
                        mapGeoData = await adjustPerTentacle(
                            question.data,
                            mapGeoData,
                            false
                        );
                        break;
                    case "matching":
                        if (!question.data.same) break;
                        mapGeoData = await adjustPerMatching(
                            question.data,
                            mapGeoData,
                            false
                        );
                        break;
                    case "measuring":
                        try {
                            mapGeoData = await adjustPerMeasuring(
                                question.data,
                                mapGeoData,
                                false
                            );
                        } catch (error: any) {
                            if (error && error.message === "Must be masked") {
                            } else {
                                console.log(error);
                            }
                        }
                        break;
                }

                if (mapGeoData.type !== "FeatureCollection") {
                    mapGeoData = {
                        type: "FeatureCollection",
                        features: [mapGeoData],
                    };
                }
            }

            if (focus) {
                const bbox = turf.bbox(mapGeoData as any);
                const bounds: [[number, number], [number, number]] = [
                    [bbox[1], bbox[0]],
                    [bbox[3], bbox[2]],
                ];
                map.fitBounds(bounds);
            }

            mapGeoData = {
                type: "FeatureCollection",
                features: [turf.mask(mapGeoData)],
            };

            for (let index = 0; index < $questions.length; index++) {
                const question = $questions[index];

                switch (question?.id) {
                    case "radius":
                        if (question.data.within) break;

                        mapGeoData = adjustPerRadius(
                            question.data,
                            mapGeoData,
                            true
                        );

                        break;
                    case "tentacles":
                        if (question.data.location !== false) break;

                        mapGeoData = adjustPerRadius(
                            {
                                ...question.data,
                                within: false,
                            },
                            mapGeoData,
                            true
                        );
                        break;
                    case "matching":
                        if (question.data.same) break;

                        mapGeoData = await adjustPerMatching(
                            question.data,
                            mapGeoData,
                            true
                        );
                        break;
                    case "measuring":
                        try {
                            mapGeoData = await adjustPerMeasuring(
                                question.data,
                                mapGeoData,
                                true
                            );
                        } catch (error: any) {
                            if (error && error.message === "Cannot be masked") {
                            } else {
                                console.log(error);
                            }
                        }
                        break;
                }

                if (mapGeoData.type !== "FeatureCollection") {
                    mapGeoData = {
                        type: "FeatureCollection",
                        features: [mapGeoData],
                    };
                }
            }

            map.eachLayer((layer: any) => {
                if (!!layer.addData) {
                    // Hopefully only geoJSON layers
                    map.removeLayer(layer);
                }
            });

            geoJSON(mapGeoData).addTo(map);
        } catch (error) {
            console.log(error);
            return toast.error("No solutions found / error occurred");
        }
    };

    const refreshQuestions = async (focus: boolean = false) => {
        await toast.promise(refreshQuestionsBase(focus), {
            pending: "Refreshing questions...",
        });
    };

    const displayMap = useMemo(
        () => (
            <MapContainer
                center={$mapGeoLocation.geometry.coordinates}
                zoom={5}
                className={cn("w-[500px] h-[500px]", className)}
                ref={leafletMapContext.set}
                contextmenu={true}
                contextmenuWidth={140}
                contextmenuItems={[
                    {
                        text: 'Add Radius',
                        callback: (e: any) => addRadius(e),
                    },
                    {
                        text: 'Add Thermometer',
                        callback: (e: any) => addThermometer(e),
                    },
                    {
                        text: 'Add Tentacles',
                        callback: (e: any) => addTentacles(e),
                    },
                    {
                        text: 'Add Matching',
                        callback: (e: any) => addMatching(e),
                    },
                    {
                        text: 'Add Measuring',
                        callback: (e: any) => addMeasuring(e),
                    },
                ]}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={20}
                    minZoom={2}
                    noWrap
                />
                <DraggableMarkers />
                <div className="leaflet-top leaflet-right">
                    <div className="leaflet-control flex-col flex gap-2">
                        <button
                            className="text-white bg-black/50 p-2 rounded-md"
                            onClick={() => {
                                if (!map) return toast.error("Map not loaded");
                                setReset(Math.random());
                            }}
                        >
                            Focus Map
                        </button>
                        <button
                            className="text-white bg-black/50 p-2 rounded-md"
                            onClick={() => {
                                const element =
                                    document.querySelector(
                                        ".leaflet-container"
                                    );
                                if (!element)
                                    return toast.error("Map not loaded");

                                if (!document.fullscreenElement) {
                                    element.requestFullscreen();
                                } else {
                                    document.exitFullscreen();
                                }
                            }}
                        >
                            Full Screen
                        </button>
                    </div>
                </div>
                <PolygonDraw />
            </MapContainer>
        ),
        [map]
    );

    useEffect(() => {
        if (!map) return;

        refreshQuestions(true);
    }, [$questions, map, reset]);

    useEffect(() => {
        const intervalId = setInterval(async () => {
            if (!map) return;
            let layerCount = 0;
            map.eachLayer((layer: any) => {
                if (!!layer.addData) {
                    // Hopefully only geoJSON layers
                    layerCount++;
                }
            });
            if (layerCount > 1) {
                console.log("Too many layers, refreshing...");
                refreshQuestions(false);
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [map]);

    return displayMap;
};

export const focusMap = (map: LeafletMap, mapGeoData: any) => {
    map.eachLayer((layer: any) => {
        if (!!layer.addData) {
            // Hopefully only geoJSON layers
            map.removeLayer(layer);
        }
    });

    geoJSON(turf.mask(mapGeoData)).addTo(map);

    const bbox = turf.bbox(mapGeoData as any);
    const bounds: [[number, number], [number, number]] = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
    ];
    map.fitBounds(bounds);
};
