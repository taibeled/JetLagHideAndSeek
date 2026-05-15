import "leaflet/dist/leaflet.css";
import "leaflet-contextmenu/dist/leaflet.contextmenu.css";
import "leaflet-contextmenu";

import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import * as L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import {
    MapContainer,
    ScaleControl,
    TileLayer,
    useMap,
    useMapEvents,
} from "react-leaflet";
import { toast } from "react-toastify";

import { DraggableMarkers } from "@/components/DraggableMarkers";
import { LeafletFullScreenButton } from "@/components/LeafletFullScreenButton";
import { MapPrint } from "@/components/MapPrint";
import { PolygonDraw } from "@/components/PolygonDraw";
import {
    additionalMapGeoLocations,
    addQuestion,
    animateMapMovements,
    autoZoom,
    baseTileLayer,
    followMe,
    hiderMode,
    isLoading,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    mapPickMode,
    mapRefreshNonce,
    permanentOverlay,
    planningModeEnabled,
    playableTerritoryUnion,
    polyGeoJSON,
    questionFinishedMapData,
    questionModified,
    questions,
    startingLocation,
    thunderforestApiKey,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import { applyQuestionsToMapGeoData, holedMask, safeUnion } from "@/maps";
import { hiderifyQuestion } from "@/maps";
import { clearCache, determineMapBoundaries } from "@/maps/api";

/**
 * CARTO Dark/Light used the non-`rastertiles` CDN paths while Voyager used
 * `rastertiles/` — those stacks render softer. Match Voyager's raster stack.
 */
const CARTO_LIGHT_RASTER =
    "https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png";
const CARTO_DARK_RASTER =
    "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png";

/**
 * Default Leaflet GeoJSON fill (#3388ff @ 0.2) reads as a milky haze on dark
 * basemaps and dulls markers / tiles; tune per basemap theme.
 */
function eliminationMaskPathOptions(): L.PathOptions {
    const theme = baseTileLayer.get();
    if (theme === "dark") {
        return {
            interactive: false,
            stroke: false,
            fillColor: "#030712",
            fillOpacity: 0.52,
        };
    }
    return {
        interactive: false,
        stroke: false,
        fillColor: "#64748b",
        fillOpacity: 0.28,
    };
}

const getTileLayer = (tileLayer: string, thunderforestApiKey: string) => {
    switch (tileLayer) {
        case "light":
            return (
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="https://carto.com/attributions">CARTO</a>; Powered by Esri and Turf.js'
                    url={CARTO_LIGHT_RASTER}
                    subdomains="abcd"
                    maxZoom={20} // This technically should be 6, but once the ratelimiting starts this can take over
                    minZoom={2}
                    noWrap
                />
            );

        case "dark":
            return (
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="https://carto.com/attributions">CARTO</a>; Powered by Esri and Turf.js'
                    url={CARTO_DARK_RASTER}
                    subdomains="abcd"
                    maxZoom={20} // This technically should be 6, but once the ratelimiting starts this can take over
                    minZoom={2}
                    noWrap
                />
            );

        case "transport":
            if (thunderforestApiKey)
                return (
                    <TileLayer
                        url={`https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=${thunderforestApiKey}`}
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="http://www.thunderforest.com/">Thunderforest</a>; Powered by Esri and Turf.js'
                        maxZoom={22}
                        minZoom={2}
                        noWrap
                    />
                );
            break;

        case "neighbourhood":
            if (thunderforestApiKey)
                return (
                    <TileLayer
                        url={`https://tile.thunderforest.com/neighbourhood/{z}/{x}/{y}.png?apikey=${thunderforestApiKey}`}
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="http://www.thunderforest.com/">Thunderforest</a>; Powered by Esri and Turf.js'
                        maxZoom={22}
                        minZoom={2}
                        noWrap
                    />
                );
            break;

        case "osmcarto":
            return (
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; Powered by Esri and Turf.js'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                    minZoom={2}
                    noWrap
                />
            );
    }

    return (
        <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="https://carto.com/attributions">CARTO</a>; Powered by Esri and Turf.js'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20} // This technically should be 6, but once the ratelimiting starts this can take over
            minZoom={2}
            noWrap
        />
    );
};

/**
 * On touch/coarse-pointer devices (iOS, Android) the leaflet-contextmenu
 * plugin requires a long-press to open. This handler intercepts a plain tap
 * (click) and immediately shows the context menu at that location so the
 * user doesn't have to hold. Skips when pick mode is active so thermometer
 * end-point placement still works normally.
 */
const MapTapMenuHandler = () => {
    const map = useMap();
    useMapEvents({
        click(e) {
            if (!window.matchMedia("(pointer: coarse)").matches) return;
            if (mapPickMode.get()) return;
            const cm = (map as any).contextmenu;
            if (!cm) return;
            if (cm.isVisible()) {
                cm.hide();
            } else {
                cm.showAt(e.containerPoint, {
                    latlng: e.latlng,
                    layerPoint: e.layerPoint,
                    containerPoint: e.containerPoint,
                });
            }
        },
    });
    return null;
};

/**
 * Rendered inside MapContainer. When `mapPickMode` is set, this intercepts
 * the next map left-click, passes the coordinates to the stored callback,
 * then clears the atom. Also shows a banner and sets a crosshair cursor so
 * the user knows the map is waiting for a tap.
 */
const MapPickModeHandler = () => {
    const $mapPickMode = useStore(mapPickMode);
    const map = useMap();

    useMapEvents({
        click(e) {
            const handler = mapPickMode.get();
            if (!handler) return;
            handler(e.latlng.lat, e.latlng.lng);
            mapPickMode.set(null);
        },
    });

    useEffect(() => {
        const container = map.getContainer();
        if ($mapPickMode) {
            container.style.cursor = "crosshair";
        } else {
            container.style.cursor = "";
        }
        return () => {
            container.style.cursor = "";
        };
    }, [$mapPickMode, map]);

    useEffect(() => {
        if (!$mapPickMode) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") mapPickMode.set(null);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [$mapPickMode]);

    if (!$mapPickMode) return null;

    return (
        <div
            className="leaflet-top leaflet-left"
            style={{ pointerEvents: "none" }}
        >
            <div className="leaflet-control m-3 rounded-lg bg-black/80 px-3 py-2 text-sm font-medium text-white shadow-lg">
                Tap the map to place the end point · Esc to cancel
            </div>
        </div>
    );
};

export const Map = ({ className }: { className?: string }) => {
    const $additionalMapGeoLocations = useStore(additionalMapGeoLocations);
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $questions = useStore(questions);
    const $baseTileLayer = useStore(baseTileLayer);
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const $hiderMode = useStore(hiderMode);
    const $followMe = useStore(followMe);
    const $permanentOverlay = useStore(permanentOverlay);
    const $mapRefreshNonce = useStore(mapRefreshNonce);
    const map = useStore(leafletMapContext);

    const followMeMarkerRef = useMemo(
        () => ({ current: null as L.Marker | null }),
        [],
    );
    const geoWatchIdRef = useMemo(
        () => ({ current: null as number | null }),
        [],
    );
    const refreshGenRef = useRef(0);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const refreshQuestions = async (focus: boolean = false) => {
        if (!map) return;

        if (isLoading.get()) return;

        isLoading.set(true);

        const gen = ++refreshGenRef.current;

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
                await toast.promise(
                    determineMapBoundaries()
                        .then((x) => {
                            mapGeoJSON.set(x);
                            mapGeoData = x;
                        })
                        .catch((error) => {
                            // Previously this was silently console.log'd,
                            // which made "map outline missing" almost
                            // impossible to diagnose in prod (no polygon
                            // rendered, no error surfaced). Surface it.
                            console.error(
                                "determineMapBoundaries failed:",
                                error,
                            );
                            toast.error(
                                `Couldn't build game territory: ${
                                    error?.message ?? "unknown error"
                                }`,
                                { toastId: "map-boundary-error" },
                            );
                        }),
                    {
                        error: "Error refreshing map data",
                    },
                );
            }
        }

        if (!mapGeoData) {
            playableTerritoryUnion.set(null);
            isLoading.set(false);
            return;
        }

        if ($hiderMode !== false) {
            for (const question of $questions) {
                await hiderifyQuestion(question);
            }

            triggerLocalRefresh.set(Math.random()); // Refresh the question sidebar with new information but not this map
        }

        if (gen !== refreshGenRef.current) {
            isLoading.set(false);
            return;
        }

        map.eachLayer((layer: any) => {
            if (layer.questionKey || layer.questionKey === 0) {
                map.removeLayer(layer);
            }
        });

        try {
            mapGeoData = await applyQuestionsToMapGeoData(
                $questions,
                mapGeoData,
                planningModeEnabled.get(),
                (geoJSONObj, question) => {
                    const geoJSONPlane = L.geoJSON(geoJSONObj);
                    // @ts-expect-error This is a check such that only this type of layer is removed
                    geoJSONPlane.questionKey = question.key;
                    geoJSONPlane.addTo(map);
                },
            );

            const territoryBeforeHoled = mapGeoData;
            /** Playable area for fitBounds — never use holed elimination geometry (world bbox). */
            let zoomTargetFeature: Feature<Polygon | MultiPolygon> | null =
                null;
            try {
                const unioned = safeUnion(territoryBeforeHoled!) as Feature<
                    Polygon | MultiPolygon
                >;
                playableTerritoryUnion.set(unioned);
                if ((territoryBeforeHoled?.features?.length ?? 0) > 0) {
                    zoomTargetFeature = unioned;
                }
            } catch {
                playableTerritoryUnion.set(null);
                if (territoryBeforeHoled?.features?.[0]?.geometry) {
                    zoomTargetFeature = territoryBeforeHoled
                        .features[0] as Feature<Polygon | MultiPolygon>;
                }
            }

            let maskedTerritory = holedMask(territoryBeforeHoled!);
            if (!maskedTerritory) {
                try {
                    const unioned = safeUnion(territoryBeforeHoled!) as Feature<
                        Polygon | MultiPolygon
                    >;
                    const masked = turf.mask(unioned as any) as
                        | Feature<Polygon | MultiPolygon>
                        | null
                        | undefined;
                    if (masked?.geometry) maskedTerritory = masked;
                } catch {
                    /* fall through */
                }
            }
            if (!maskedTerritory) {
                maskedTerritory = safeUnion(territoryBeforeHoled!) as Feature<
                    Polygon | MultiPolygon
                >;
            }
            mapGeoData = {
                type: "FeatureCollection",
                features: [maskedTerritory],
            };

            map.eachLayer((layer: any) => {
                if (layer.eliminationGeoJSON) {
                    // Hopefully only geoJSON layers
                    map.removeLayer(layer);
                }
            });

            const g = L.geoJSON(mapGeoData, {
                style: () => eliminationMaskPathOptions(),
            });
            // @ts-expect-error This is a check such that only this type of layer is removed
            g.eliminationGeoJSON = true;
            g.addTo(map);

            questionFinishedMapData.set(mapGeoData);

            if (autoZoom.get() && focus && zoomTargetFeature?.geometry) {
                const bbox = turf.bbox(zoomTargetFeature as any);
                const [west, south, east, north] = bbox;
                const latSpan = north - south;
                const lngSpan = east - west;
                const bboxOk =
                    Number.isFinite(west) &&
                    Number.isFinite(south) &&
                    Number.isFinite(east) &&
                    Number.isFinite(north) &&
                    latSpan > 1e-6 &&
                    lngSpan > 1e-6 &&
                    latSpan < 170 &&
                    lngSpan < 300;

                if (bboxOk) {
                    const bounds = [
                        [south, west],
                        [north, east],
                    ];
                    if (animateMapMovements.get()) {
                        map.flyToBounds(bounds as any);
                    } else {
                        map.fitBounds(bounds as any);
                    }
                }
            }
        } catch (error) {
            console.log(error);
            playableTerritoryUnion.set(null);

            isLoading.set(false);
            // Previously this only fired if no other toast was visible —
            // fragile (could silently swallow the error while an unrelated
            // toast was on-screen) and opaque (users never saw what broke).
            // Use toastId so Toastify itself dedupes repeated re-renders,
            // and always surface something.
            const msg =
                error instanceof Error && error.message
                    ? error.message
                    : "No solutions found / error occurred";
            toast.error(msg, {
                toastId: "map-apply-questions-failed",
                autoClose: 6000,
            });
        } finally {
            isLoading.set(false);
        }
    };

    const displayMap = useMemo(
        () => (
            <MapContainer
                // NOTE: we explicitly do NOT set `preferCanvas={true}`
                // here. Canvas renders simple polygons faster, but
                // Leaflet's canvas path has known issues drawing
                // polygons-with-holes, which is exactly the shape the
                // game-territory mask uses (world outer ring with a
                // region-shaped hole cut out of it). Forcing canvas
                // made the mask invisible on Railway even though the
                // geometry was correct. SVG is plenty fast now that
                // Nominatim returns pre-simplified boundaries.
                center={$mapGeoLocation.geometry.coordinates}
                zoom={5}
                className={cn("w-full h-full", className)}
                ref={leafletMapContext.set}
                // @ts-expect-error Typing doesn't update from react-contextmenu
                contextmenu={true}
                contextmenuWidth={180}
                contextmenuItems={[
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
                            // Place both pins at the tapped location. Pick
                            // mode immediately activates so the next tap on
                            // the map sets the end point.
                            addQuestion({
                                id: "thermometer",
                                data: {
                                    latA: e.latlng.lat,
                                    lngA: e.latlng.lng,
                                    latB: e.latlng.lat,
                                    lngB: e.latlng.lng,
                                },
                            });
                            mapPickMode.set((lat, lng) => {
                                const qs = questions.get();
                                const last = qs[qs.length - 1];
                                if (last?.id === "thermometer") {
                                    last.data.latB = lat;
                                    last.data.lngB = lng;
                                    questionModified();
                                }
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
                        text: "Set starting location",
                        callback: (e: any) => {
                            startingLocation.set({
                                latitude: e.latlng.lat,
                                longitude: e.latlng.lng,
                            });
                            toast.success(
                                "Starting location set — used for transit reachability.",
                                { toastId: "starting-location-set" },
                            );
                        },
                    },
                    {
                        text: "Exclude Country",
                        callback: (e: any) => {
                            addQuestion({
                                id: "matching",
                                data: {
                                    lat: e.latlng.lat,
                                    lng: e.latlng.lng,
                                    same: false,
                                    cat: {
                                        adminLevel: 2,
                                    },
                                    type: "zone",
                                },
                            });
                        },
                    },
                    {
                        text: "Copy Coordinates",
                        callback: (e: any) => {
                            if (!navigator || !navigator.clipboard) {
                                toast.error(
                                    "Clipboard API not supported in your browser",
                                );
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
                ]}
            >
                {getTileLayer($baseTileLayer, $thunderforestApiKey)}
                <MapTapMenuHandler />
                <MapPickModeHandler />
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
        // `$mapGeoLocation.geometry.coordinates` is the *initial* map
        // center — Leaflet ignores subsequent changes to the `center`
        // prop so there's no benefit to reactively re-creating the
        // container. Same story for `className`, which is passed from
        // Astro as a static string.

        [map, $baseTileLayer, $thunderforestApiKey],
    );

    useEffect(() => {
        if (!map) return;

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
            refreshTimerRef.current = null;
            refreshQuestions(true);
        }, 120);

        return () => {
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
        // `refreshQuestions` is defined in the component body and
        // closes over live store reads (`questions.get()` etc.), so its
        // identity changes on every render. Putting it in deps would
        // kick the debounce on every state change. We want the debounce
        // to fire only on the real inputs listed below.
    }, [
        $questions,
        map,
        $hiderMode,
        $mapGeoLocation,
        $additionalMapGeoLocations,
        // Bumped by the detailed-boundary upgrade flow after it swaps
        // in the Overpass polygon, so we re-render the new geometry
        // without waiting on some other dep to change.
        $mapRefreshNonce,
    ]);

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

    useEffect(() => {
        if (!map) return;
        if (!$followMe) {
            if (followMeMarkerRef.current) {
                map.removeLayer(followMeMarkerRef.current);
                followMeMarkerRef.current = null;
            }
            if (geoWatchIdRef.current !== null) {
                navigator.geolocation.clearWatch(geoWatchIdRef.current);
                geoWatchIdRef.current = null;
            }
            return;
        }

        geoWatchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if (followMeMarkerRef.current) {
                    followMeMarkerRef.current.setLatLng([lat, lng]);
                } else {
                    const marker = L.marker([lat, lng], {
                        icon: L.divIcon({
                            html: `<div class="text-blue-700 bg-white rounded-full border-2 border-blue-700 shadow-sm w-5 h-5 flex items-center justify-center"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#2A81CB" opacity="0.5"/><circle cx="8" cy="8" r="3" fill="#2A81CB"/></svg></div>`,
                            className: "",
                        }),
                        zIndexOffset: 1000,
                    });
                    marker.addTo(map);
                    followMeMarkerRef.current = marker;
                }
            },
            () => {
                toast.error("Unable to access your location.");
                followMe.set(false);
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
        );
        return () => {
            if (followMeMarkerRef.current) {
                map.removeLayer(followMeMarkerRef.current);
                followMeMarkerRef.current = null;
            }
            if (geoWatchIdRef.current !== null) {
                navigator.geolocation.clearWatch(geoWatchIdRef.current);
                geoWatchIdRef.current = null;
            }
        };
        // `followMeMarkerRef` and `geoWatchIdRef` are refs, not values;
        // including them in deps would be a hook-rules false positive.
    }, [$followMe, map]);

    useEffect(() => {
        if (!map) return;

        map.eachLayer((layer: any) => {
            if (layer.permanentGeoJSON) map.removeLayer(layer);
        });

        if ($permanentOverlay === null) return;

        try {
            const overlay = L.geoJSON($permanentOverlay, {
                interactive: false,

                // @ts-expect-error Type hints force a Layer to be returned, but Leaflet accepts null as well
                pointToLayer(_geoJsonPoint, _latlng) {
                    return null;
                },

                style(feature) {
                    return {
                        color: feature?.properties?.stroke,
                        weight: feature?.properties?.["stroke-width"],
                        opacity: feature?.properties?.["stroke-opacity"],
                        fillColor: feature?.properties?.fill,
                        fillOpacity: feature?.properties?.["fill-opacity"],
                    };
                },
            });
            // @ts-expect-error This is a check such that only this type of layer is removed
            overlay.permanentGeoJSON = true;
            overlay.addTo(map);
            overlay.bringToBack();
        } catch (e) {
            toast.error(`Failed to display GeoJSON overlay: ${e}`);
        }
    }, [$permanentOverlay, map]);

    return displayMap;
};
