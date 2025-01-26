import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer } from "react-leaflet";
import { geoJSON, type Map as LeafletMap } from "leaflet";
import { cn } from "../utils/cn";
import { mapGeoJSON, mapGeoLocation, questions } from "../utils/context";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import * as turf from "@turf/turf";
import { determineGeoJSON } from "../maps/api";
import { adjustPerRadius } from "../maps/radius";
import { DraggableMarkers } from "./QuestionList";
import { adjustPerThermometer } from "../maps/thermometer";

export const Map = ({ className }: { className?: string }) => {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $questions = useStore(questions);
    const [map, setMap] = useState<LeafletMap | null>(null);
    const [reset, setReset] = useState(0);

    const refreshMapData = (screen: boolean = true) => {
        if (!map) return;

        const refresh = async () => {
            map.eachLayer((layer: any) => {
                if (!!layer.addData) { // Hopefully only geoJSON layers
                    map.removeLayer(layer);
                }
            });

            const mapGeoData = await determineGeoJSON(
                $mapGeoLocation.properties.osm_id.toString(),
                $mapGeoLocation.properties.osm_type
            );

            mapGeoJSON.set(mapGeoData);

            if (screen) {
                geoJSON(turf.mask(mapGeoData)).addTo(map);

                const bbox = turf.bbox(mapGeoData as any);
                const bounds: [[number, number], [number, number]] = [
                    [bbox[1], bbox[0]],
                    [bbox[3], bbox[2]],
                ];
                map.fitBounds(bounds);
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

    const refreshQuestions = (focus: boolean = false) => {
        if (!map) return;

        if ($questions.length === 0) {
            refreshMapData();
            return;
        }

        return refreshMapData(false)!
            .then(async (mapGeoData) => {
                for (let index = 0; index < $questions.length; index++) {
                    const question = $questions[index];
                    let interior = false;

                    switch (question?.id) {
                        case "radius":
                            if (!question.data.within) {
                                interior = true;
                            } else {
                                mapGeoData = adjustPerRadius(
                                    question.data,
                                    mapGeoData,
                                    false
                                );
                            }
                            break;
                        case "thermometer":
                            mapGeoData = adjustPerThermometer(
                                question.data,
                                mapGeoData,
                                false
                            );
                            break;
                        default:
                            interior = true; // All other cases
                    }

                    if (interior) continue;

                    mapGeoData = {
                        type: "FeatureCollection",
                        features: [mapGeoData],
                    };
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
                    let interior = true;

                    switch (question?.id) {
                        case "radius":
                            if (question.data.within) {
                                interior = false;
                            } else {
                                mapGeoData = adjustPerRadius(
                                    question.data,
                                    mapGeoData,
                                    true
                                );
                            }
                            break;
                        default:
                            interior = false; // All other cases
                    }

                    if (!interior) continue;

                    mapGeoData = {
                        type: "FeatureCollection",
                        features: [mapGeoData],
                    };
                }

                mapGeoJSON.set(mapGeoData);
                geoJSON(mapGeoData).addTo(map);
            })
            .catch((error) => {
                console.log(error);
                return toast.error("No solutions found / error occurred");
            });
    };

    const displayMap = useMemo(
        () => (
            <MapContainer
                center={$mapGeoLocation.geometry.coordinates}
                zoom={5}
                className={cn("w-[500px] h-[500px]", className)}
                ref={setMap}
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
            </MapContainer>
        ),
        [map]
    );

    useEffect(() => {
        if (!map) return;

        questions.set([]);
    }, [$mapGeoLocation]);

    useEffect(() => {
        if (!map) return;

        refreshQuestions(true);
    }, [$questions, map, reset]);

    return displayMap;
};
