import "leaflet/dist/leaflet.css";
import "leaflet-contextmenu/dist/leaflet.contextmenu.css";
import { MapContainer, ScaleControl, TileLayer } from "react-leaflet";
import { geoJSON, type Map as LeafletMap } from "leaflet";
import "leaflet-contextmenu";
import { cn } from "../lib/utils";
import {
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    questions,
    highlightTrainLines,
    hiderMode,
    triggerLocalRefresh,
    questionFinishedMapData,
    animateMapMovements,
    addQuestion,
    planningModeEnabled,
    isLoading,
    autoZoom,
    additionalMapGeoLocations,
} from "../lib/context";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import * as turf from "@turf/turf";
import { clearCache, determineGeoJSON } from "../maps/api";
import { adjustPerRadius, radiusPlanningPolygon } from "../maps/radius";
import { DraggableMarkers } from "./DraggableMarkers";
import {
    adjustPerThermometer,
    thermometerPlanningPolygon,
} from "../maps/thermometer";
import { adjustPerTentacle, tentaclesPlanningPolygon } from "../maps/tentacles";
import { adjustPerMatching, matchingPlanningPolygon } from "../maps/matching";
import { PolygonDraw } from "./PolygonDraw";
import { adjustPerMeasuring, measuringPlanningPolygon } from "@/maps/measuring";
import { LeafletFullScreenButton } from "./LeafletFullScreenButton";
import { hiderifyQuestion } from "@/maps";
import { holedMask, unionize } from "@/maps/geo-utils";
import { MapPrint } from "./MapPrint";
import 'dotenv/config'


export const refreshMapData = (screen: boolean = true, map?: LeafletMap) => {
    const refresh = async () => {
        const mapGeoDatum = await Promise.all(
            [
                { location: mapGeoLocation.get(), added: true, base: true },
                ...additionalMapGeoLocations.get(),
            ].map(async (location) => ({
                added: location.added,
                data: await determineGeoJSON(
                    location.location.properties.osm_id.toString(),
                    location.location.properties.osm_type,
                ),
            })),
        );

        let mapGeoData = turf.featureCollection([
            unionize(
                turf.featureCollection(
                    mapGeoDatum
                        .filter((x) => x.added)
                        .flatMap((x) => x.data.features),
                ) as any,
            ),
        ]);

        const differences = mapGeoDatum
            .filter((x) => !x.added)
            .map((x) => x.data);

        if (differences.length > 0) {
            mapGeoData = turf.featureCollection([
                turf.difference(
                    turf.featureCollection([
                        mapGeoData.features[0],
                        ...differences.flatMap((x) => x.features),
                    ]),
                )!,
            ]);
        }

        if (turf.coordAll(mapGeoData).length > 10000) {
            turf.simplify(mapGeoData, {
                tolerance: 0.0005,
                highQuality: true,
                mutate: true,
            });
        }

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
            error: "Error refreshing map data",
        },
    );
};

export const Map = ({ className }: { className?: string }) => {
    useStore(additionalMapGeoLocations);
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $questions = useStore(questions);
    const $highlightTrainLines = useStore(highlightTrainLines);
    const $hiderMode = useStore(hiderMode);
    const $isLoading = useStore(isLoading);
    const map = useStore(leafletMapContext);

    const refreshQuestions = async (focus: boolean = false) => {
        if (!map) return;

        if ($isLoading) return;

        isLoading.set(true);

        if ($questions.length === 0) {
            await clearCache();
        }

        let mapGeoData = mapGeoJSON.get();

        if (!mapGeoData) {
            const polyGeoData = polyGeoJSON.get();
            if (polyGeoData) {
                mapGeoData = polyGeoData;
                mapGeoJSON.set(polyGeoData);
            } else {
                mapGeoData = await refreshMapData(false, map);
            }
        }

        if ($hiderMode !== false) {
            for (const question of $questions) {
                await hiderifyQuestion(question);
            }

            triggerLocalRefresh.set(Math.random()); // Refresh the question sidebar with new information but not this map
        }

        map.eachLayer((layer: any) => {
            if (layer.questionKey || layer.questionKey === 0) {
                map.removeLayer(layer);
            }
        });

        try {
            for (let index = 0; index < $questions.length; index++) {
                const question = $questions[index];

                switch (question?.id) {
                    case "radius":
                        if (question.data.drag && planningModeEnabled.get()) {
                            const geoJSONObj = radiusPlanningPolygon(
                                question.data,
                            );
                            const geoJSONPlane = geoJSON(geoJSONObj);
                            // @ts-expect-error This is a check such that only this type of layer is removed
                            geoJSONPlane.questionKey = question.key;
                            geoJSONPlane.addTo(map);
                        }
                        if (planningModeEnabled.get() && question.data.drag) {
                            break;
                        }
                        if (!question.data.within) break;
                        mapGeoData = adjustPerRadius(
                            question.data,
                            mapGeoData,
                            false,
                        );
                        break;
                    case "thermometer":
                        if (question.data.drag && planningModeEnabled.get()) {
                            const geoJSONObj = thermometerPlanningPolygon(
                                question.data,
                            );
                            const geoJSONPlane = geoJSON(geoJSONObj);
                            // @ts-expect-error This is a check such that only this type of layer is removed
                            geoJSONPlane.questionKey = question.key;
                            geoJSONPlane.addTo(map);
                        }
                        if (planningModeEnabled.get() && question.data.drag) {
                            break;
                        }

                        mapGeoData = adjustPerThermometer(
                            question.data,
                            mapGeoData,
                            false,
                        );
                        break;
                    case "tentacles":
                        if (question.data.drag && planningModeEnabled.get()) {
                            const geoJSONObj = await tentaclesPlanningPolygon(
                                question.data,
                            );
                            const geoJSONPlane = geoJSON(geoJSONObj);
                            // @ts-expect-error This is a check such that only this type of layer is removed
                            geoJSONPlane.questionKey = question.key;
                            geoJSONPlane.addTo(map);
                        }
                        if (planningModeEnabled.get() && question.data.drag) {
                            break;
                        }

                        if (question.data.location === false) break;
                        mapGeoData = await adjustPerTentacle(
                            question.data,
                            mapGeoData,
                            false,
                        );
                        break;
                    case "matching":
                        if (question.data.drag && planningModeEnabled.get()) {
                            const geoJSONObj = await matchingPlanningPolygon(
                                question.data,
                            );

                            if (geoJSONObj) {
                                const geoJSONPlane = geoJSON(geoJSONObj);
                                // @ts-expect-error This is a check such that only this type of layer is removed
                                geoJSONPlane.questionKey = question.key;
                                geoJSONPlane.addTo(map);
                            }
                        }
                        if (planningModeEnabled.get() && question.data.drag) {
                            break;
                        }

                        try {
                            mapGeoData = await adjustPerMatching(
                                question.data,
                                mapGeoData,
                                false,
                            );
                        } catch (error: any) {
                            if (error && error.message === "Must be masked") {
                                /* empty */
                            } else {
                                console.log(error);
                                throw error;
                            }
                        }
                        break;
                    case "measuring":
                        if (question.data.drag && planningModeEnabled.get()) {
                            const geoJSONObj = await measuringPlanningPolygon(
                                question.data,
                            );

                            if (geoJSONObj) {
                                const geoJSONPlane = geoJSON(geoJSONObj);
                                // @ts-expect-error This is a check such that only this type of layer is removed
                                geoJSONPlane.questionKey = question.key;
                                geoJSONPlane.addTo(map);
                            }
                        }
                        if (planningModeEnabled.get() && question.data.drag) {
                            break;
                        }
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
                                throw error;
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

            let bounds: [[number, number], [number, number]] | undefined;

            if (focus) {
                const bbox = turf.bbox(mapGeoData as any);
                bounds = [
                    [bbox[1], bbox[0]],
                    [bbox[3], bbox[2]],
                ];
            }

            mapGeoData = {
                type: "FeatureCollection",
                features: [holedMask(mapGeoData)],
            };

            for (let index = 0; index < $questions.length; index++) {
                const question = $questions[index];

                if (planningModeEnabled.get() && question.data.drag) {
                    continue;
                }

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
                        try {
                            mapGeoData = await adjustPerMatching(
                                question.data,
                                mapGeoData,
                                true,
                            );
                        } catch (error: any) {
                            if (error && error.message === "Cannot be masked") {
                                /* empty */
                            } else {
                                console.log(error);
                                throw error;
                            }
                        }
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
                                throw error;
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
                if (layer.eliminationGeoJSON) {
                    // Hopefully only geoJSON layers
                    map.removeLayer(layer);
                }
            });

            const g = geoJSON(mapGeoData);
            // @ts-expect-error This is a check such that only this type of layer is removed
            g.eliminationGeoJSON = true;
            g.addTo(map);

            questionFinishedMapData.set(mapGeoData);

            if (autoZoom.get()) {
                if (bounds) {
                    if (animateMapMovements.get()) {
                        map.flyToBounds(bounds);
                    } else {
                        map.fitBounds(bounds);
                    }
                }
            }
        } catch (error) {
            console.log(error);

            isLoading.set(false);
            if (document.querySelectorAll(".Toastify__toast").length === 0) {
                return toast.error("No solutions found / error occurred");
            }
        } finally {
            isLoading.set(false);
        }
    };

    const contextmenuItems = [
        {
            text: "Add Radius",
            callback: (e: any) =>
                addQuestion({
                    id: "radius",
                    data: {
                        lat: e.latlng.lat,
                        lng: e.latlng.lng,
                    },
                }),
        },
        {
            text: "Add Thermometer",
            callback: (e: any) => {
                const destination = turf.destination(
                    [e.latlng.lng, e.latlng.lat],
                    5,
                    90,
                    {
                        units: "miles",
                    },
                );

                addQuestion({
                    id: "thermometer",
                    data: {
                        latA: e.latlng.lat,
                        lngA: e.latlng.lng,
                        latB: destination.geometry.coordinates[1],
                        lngB: destination.geometry.coordinates[0],
                    },
                });
            },
        },
        {
            text: "Add Tentacles",
            callback: (e: any) => {
                addQuestion({
                    id: "tentacles",
                    data: {
                        lat: e.latlng.lat,
                        lng: e.latlng.lng,
                    },
                });
            },
        },
        {
            text: "Add Matching",
            callback: (e: any) => {
                addQuestion({
                    id: "matching",
                    data: {
                        lat: e.latlng.lat,
                        lng: e.latlng.lng,
                    },
                });
            },
        },
        {
            text: "Add Measuring",
            callback: (e: any) => {
                addQuestion({
                    id: "measuring",
                    data: {
                        lat: e.latlng.lat,
                        lng: e.latlng.lng,
                    },
                });
            },
        },
        {
            text: "Copy Coordinates",
            callback: (e: any) => {
                if (!navigator || !navigator.clipboard) {
                    toast.error("Clipboard API not supported in your browser");
                    return;
                }

                const latitude = e.latlng.lat;
                const longitude = e.latlng.lng;

                toast.promise(
                    navigator.clipboard.writeText(
                        `${Math.abs(latitude)}°${latitude > 0 ? "N" : "S"}, ${Math.abs(
                            longitude,
                        )}°${longitude > 0 ? "E" : "W"}`,
                    ),
                    {
                        pending: "Writing to clipboard...",
                        success: "Coordinates copied!",
                        error: "An error occurred while copying",
                    },
                    { autoClose: 1000 },
                );
            },
        },
    ];

    $hiderMode ??
        contextmenuItems.push({
            text: "Draw Cards",
            callback: (e: any) => {
                console.log("Drawing cards");
            },
        });

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
                contextmenuItems={contextmenuItems}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> and <a href="http://www.thunderforest.com/">Thunderforest</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={20} // This technically should be 6, but once the ratelimiting starts this can take over
                    minZoom={2}
                    noWrap
                />
                {$highlightTrainLines && (
                    <TileLayer
                        url={`https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=${process.env.THUNDERFOREST_KEY}`}
                        maxZoom={22}
                        minZoom={7}
                        noWrap
                    />
                )}
                <DraggableMarkers />
                <div className="leaflet-top leaflet-right">
                    <div className="leaflet-control flex-col flex gap-2">
                        <LeafletFullScreenButton />
                    </div>
                </div>
                <PolygonDraw />
                <ScaleControl position="bottomleft" />
                <MapPrint
                    position="topright"
                    sizeModes={["Current", "A4Portrait", "A4Landscape"]}
                    hideControlContainer={false}
                    hideClasses={[
                        "leaflet-full-screen-specific-name",
                        "leaflet-top",
                        "leaflet-control-easyPrint",
                        "leaflet-draw",
                    ]}
                    title="Print"
                />
            </MapContainer>
        ),
        [map, $highlightTrainLines],
    );

    useEffect(() => {
        if (!map) return;

        refreshQuestions(true);
    }, [$questions, map, $hiderMode]);

    useEffect(() => {
        const intervalId = setInterval(async () => {
            if (!map) return;
            let layerCount = 0;
            map.eachLayer((layer: any) => {
                if (layer.eliminationGeoJSON) {
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
            const mainElement: HTMLElement | null =
                document.querySelector("main");

            if (mainElement) {
                if (document.fullscreenElement) {
                    mainElement.classList.add("fullscreen");
                } else {
                    mainElement.classList.remove("fullscreen");
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
        if (layer.eliminationGeoJSON) {
            // Hopefully only geoJSON layers
            map.removeLayer(layer);
        }
    });

    const g = geoJSON(holedMask(mapGeoData));
    // @ts-expect-error This is a check such that only this type of layer is removed
    g.eliminationGeoJSON = true;
    g.addTo(map);

    const bbox = turf.bbox(mapGeoData as any);
    const bounds: [[number, number], [number, number]] = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
    ];

    if (autoZoom.get()) {
        if (animateMapMovements.get()) {
            map.flyToBounds(bounds);
        } else {
            map.fitBounds(bounds);
        }
    }
};
