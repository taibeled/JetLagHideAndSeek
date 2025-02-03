import "leaflet/dist/leaflet.css";
import "leaflet-contextmenu/dist/leaflet.contextmenu.css";
import { MapContainer, TileLayer } from "react-leaflet";
import { geoJSON, type Map as LeafletMap } from "leaflet";
import "leaflet-contextmenu";
import { cn } from "../lib/utils";
import {
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    questions,
} from "../utils/context";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import * as turf from "@turf/turf";
import { determineGeoJSON, type OpenStreetMap } from "../maps/api";
import { addDefaultRadius, adjustPerRadius } from "../maps/radius";
import { DraggableMarkers } from "./DraggableMarkers";
import {
    addDefaultThermometer,
    adjustPerThermometer,
} from "../maps/thermometer";
import { addDefaultTentacles, adjustPerTentacle } from "../maps/tentacles";
import { addDefaultMatching, adjustPerMatching } from "../maps/matching";
import { PolygonDraw } from "./PolygonDraw";
import { addDefaultMeasuring, adjustPerMeasuring } from "@/maps/measuring";

export const refreshMapData = (
    $mapGeoLocation: OpenStreetMap,
    screen: boolean = true,
    map?: LeafletMap,
) => {
    const refresh = async () => {
        const mapGeoData = await determineGeoJSON(
            $mapGeoLocation.properties.osm_id.toString(),
            $mapGeoLocation.properties.osm_type,
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
        },
    );
};

export const Map = ({ className }: { className?: string }) => {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $questions = useStore(questions);
    const map = useStore(leafletMapContext);

    const addRadius = (e: { latlng: any }) => {
        addDefaultRadius(e.latlng);
    };

    const addThermometer = (e: { latlng: any }) => {
        addDefaultThermometer(e.latlng);
    };

    const addTentacles = (e: { latlng: any }) => {
        addDefaultTentacles(e.latlng);
    };

    const addMatching = (e: { latlng: any }) => {
        addDefaultMatching(e.latlng);
    };

    const addMeasuring = (e: { latlng: any }) => {
        addDefaultMeasuring(e.latlng);
    };

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
                            false,
                        );
                        break;
                    case "thermometer":
                        mapGeoData = adjustPerThermometer(
                            question.data,
                            mapGeoData,
                            false,
                        );
                        break;
                    case "tentacles":
                        if (question.data.location === false) break;
                        mapGeoData = await adjustPerTentacle(
                            question.data,
                            mapGeoData,
                            false,
                        );
                        break;
                    case "matching":
                        if (!question.data.same) break;
                        mapGeoData = await adjustPerMatching(
                            question.data,
                            mapGeoData,
                            false,
                        );
                        break;
                    case "measuring":
                        try {
                            mapGeoData = await adjustPerMeasuring(
                                question.data,
                                mapGeoData,
                                false,
                            );
                        } catch (error: any) {
                            if (error && error.message === "Must be masked") {
                                /* empty */
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
                            true,
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
                            true,
                        );
                        break;
                    case "matching":
                        if (question.data.same) break;

                        mapGeoData = await adjustPerMatching(
                            question.data,
                            mapGeoData,
                            true,
                        );
                        break;
                    case "measuring":
                        try {
                            mapGeoData = await adjustPerMeasuring(
                                question.data,
                                mapGeoData,
                                true,
                            );
                        } catch (error: any) {
                            if (error && error.message === "Cannot be masked") {
                                /* empty */
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
                if (layer.addData) {
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
                // @ts-expect-error Typing doesn't update from react-contextmenu
                contextmenu={true}
                contextmenuWidth={140}
                contextmenuItems={[
                    {
                        text: "Add Radius",
                        callback: (e: any) => addRadius(e),
                    },
                    {
                        text: "Add Thermometer",
                        callback: (e: any) => addThermometer(e),
                    },
                    {
                        text: "Add Tentacles",
                        callback: (e: any) => addTentacles(e),
                    },
                    {
                        text: "Add Matching",
                        callback: (e: any) => addMatching(e),
                    },
                    {
                        text: "Add Measuring",
                        callback: (e: any) => addMeasuring(e),
                    },
                ]}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={20}
                    minZoom={2}
                    noWrap
                />
                <DraggableMarkers />
                <PolygonDraw />
            </MapContainer>
        ),
        [map],
    );

    useEffect(() => {
        if (!map) return;

        refreshQuestions(true);
    }, [$questions, map]);

    useEffect(() => {
        const intervalId = setInterval(async () => {
            if (!map) return;
            let layerCount = 0;
            map.eachLayer((layer: any) => {
                if (layer.addData) {
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

    useEffect(() => {
        const handleFullscreenChange = () => {
            const leafletMap: HTMLDivElement | null =
                document.querySelector(".leaflet-container");

            if (leafletMap) {
                if (document.fullscreenElement) {
                    leafletMap.classList.add("fullscreen");
                } else {
                    leafletMap.classList.remove("fullscreen");
                }
            }
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);

        return () => {
            document.removeEventListener(
                "fullscreenchange",
                handleFullscreenChange,
            );
        };
    }, []);

    return displayMap;
};

export const focusMap = (map: LeafletMap, mapGeoData: any) => {
    map.eachLayer((layer: any) => {
        if (layer.addData) {
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
