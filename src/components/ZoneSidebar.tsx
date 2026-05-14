import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Point } from "geojson";
import * as L from "leaflet";
import _ from "lodash";
import { Loader2, SidebarCloseIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";

import ReachabilitySection from "@/components/ReachabilitySection";
import { TransitSystemsButton } from "@/components/TransitSystemsDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { MENU_ITEM_CLASSNAME } from "@/components/ui/sidebar-l";
import { SidebarContext as LeftSidebarContext } from "@/components/ui/sidebar-l-context";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar-r";
import { SidebarContext as RightSidebarContext } from "@/components/ui/sidebar-r";
import { UnitSelect } from "@/components/UnitSelect";
import {
    activeStationsOnly as activeStationsOnlyAtom,
    additionalMapGeoLocations,
    animateMapMovements,
    autoZoom,
    customStations as customStationsAtom,
    disabledStations,
    displayHidingZones,
    displayHidingZonesOptions,
    displayHidingZonesStyle,
    excludeHeritageRailways as excludeHeritageRailwaysAtom,
    hidingRadius,
    hidingRadiusUnits,
    includeDefaultStations as includeDefaultStationsAtom,
    isLoading,
    leafletMapContext,
    mapGeoLocation,
    mergeDuplicates as mergeDuplicatesAtom,
    planningModeEnabled,
    polyGeoJSON,
    questionFinishedMapData,
    questions,
    reachabilityClassifications,
    reachabilityOverrides as reachabilityOverridesAtom,
    reachabilityResult as reachabilityResultAtom,
    trainStations,
    triggerLocalRefresh,
    useCustomStations as useCustomStationsAtom,
} from "@/lib/context";
import { getAllStops } from "@/lib/transit/gtfs-store";
import {
    buildStopIndex,
    type MatchedStation,
    matchOsmToGtfs,
    type OsmStationInput,
} from "@/lib/transit/osm-gtfs-match";
import type { TransitStop } from "@/lib/transit/types";
import { cn } from "@/lib/utils";
import {
    BLANK_GEOJSON,
    findHeritageRailwayMemberNodeIds,
    findPlacesInZone,
    findPlacesSpecificInZone,
    normalizeToStationFeatures,
    OVERPASS_ACTIVE_RAIL_STATION_EXCLUSIONS,
    overpassZoneCacheKey,
    parseCustomStationsFromText,
    QuestionSpecificLocation,
    type StationCircle,
    type StationPlace,
} from "@/maps/api";
import osmtogeojson from "@/maps/api/osm-to-geojson";
import {
    applyQuestionFilters,
    buildCirclesFromPlaces,
    cullCirclesAgainstZone,
    extractStationLabel,
    extractStationName,
    geoSpatialVoronoi,
    holedMask,
    lngLatToText,
    mergeDuplicateStation,
    playableBboxFromHoledMask,
    prefetchMatchingFacilityPoints,
    prefetchMeasuringPoiPoints,
    safeUnion,
    stationsSignature,
} from "@/maps/geo-utils";
import { filterCirclesByReachability } from "@/maps/geo-utils/zonePipeline";
import { findMatchingPlaces } from "@/maps/questions/matching";

function _previewText(count: number) {
    return `${count} custom station${count === 1 ? "" : "s"} imported`;
}

let buttonJustClicked = false;

export const ZoneSidebar = () => {
    const $displayHidingZones = useStore(displayHidingZones);
    const $questionFinishedMapData = useStore(questionFinishedMapData);
    const $displayHidingZonesOptions = useStore(displayHidingZonesOptions);
    const $displayHidingZonesStyle = useStore(displayHidingZonesStyle);
    const $hidingRadius = useStore(hidingRadius);
    const $hidingRadiusUnits = useStore(hidingRadiusUnits);
    const $isLoading = useStore(isLoading);
    const map = useStore(leafletMapContext);
    const stations = useStore(trainStations);
    const $disabledStations = useStore(disabledStations);
    const useCustomStations = useStore(useCustomStationsAtom);
    const mergeDuplicates = useStore(mergeDuplicatesAtom);
    const includeDefaultStations = useStore(includeDefaultStationsAtom);
    const activeStationsOnly = useStore(activeStationsOnlyAtom);
    const excludeHeritageRailways = useStore(excludeHeritageRailwaysAtom);
    const $reachabilityResult = useStore(reachabilityResultAtom);
    const $reachabilityOverrides = useStore(reachabilityOverridesAtom);
    const leftSidebar = useStore(LeftSidebarContext);
    const rightSidebar = useStore(RightSidebarContext);
    const $reachabilityClassifications = useStore(reachabilityClassifications);
    const $customStations = useStore(customStationsAtom);
    const $questions = useStore(questions);
    const $triggerLocalRefresh = useStore(triggerLocalRefresh);
    // Subscribe to the scope stores so Phase A re-runs when the user
    // picks a new city / draws a new boundary.
    const $polyGeoJSON = useStore(polyGeoJSON);
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $additionalMapGeoLocations = useStore(additionalMapGeoLocations);
    const [isHidingZoneLoading, setIsHidingZoneLoading] = useState(false);
    const hidingZoneLoadingRef = useRef(false);
    const pendingRefreshRef = useRef(false);
    // Phase-B generation counter so late-resolving async work (e.g. the
    // McDonald's / 7-Eleven Overpass fetch, or `trainLineNodeFinder`)
    // can't race with a newer filter pass.
    const filterGenRef = useRef(0);
    const [rawCircles, setRawCircles] = useState<StationCircle[] | null>(null);
    // OSM ↔ GTFS match table + stop lookup, built lazily from `rawCircles`
    // whenever a reachability query has been run. Null when reachability
    // isn't in use (no bundle → no filter, no work in Phase B).
    const [reachabilityBundle, setReachabilityBundle] = useState<{
        matches: Map<string, MatchedStation>;
        stopById: Map<string, TransitStop>;
    } | null>(null);
    const bundleGenRef = useRef(0);
    const [hidingZoneModeStationID, setHidingZoneModeStationID] =
        useState<string>("");
    const [stationSearch, setStationSearch] = useState<string>("");
    const isStationSearchActive = stationSearch.trim().length > 0;
    const setStations = trainStations.set;
    const sidebarRef = useRef<HTMLDivElement>(null);
    const [importUrl, setImportUrl] = useState("");

    const removeHidingZones = () => {
        if (!map) return;

        map.eachLayer((layer: any) => {
            if (layer.hidingZones) {
                // Hopefully only geoJSON layers
                map.removeLayer(layer);
            }
        });
    };

    const showGeoJSON = (
        geoJSONData: any,
        nonOverlappingStations: boolean = false,
        additionalOptions: L.GeoJSONOptions = {},
        /**
         * Optional lookup from OSM id → display status. When a
         * reachability query is active, Phase B supplies this so we
         * can color unknown / overridden circles differently from
         * the default reachable green. Leave undefined to fall back
         * to the old uniform-green look.
         */
        statusLookup?: (osmId: string | undefined) =>
            | {
                  status: "reachable" | "unreachable" | "unknown";
                  override: "include" | "exclude" | undefined;
              }
            | undefined,
    ) => {
        if (!map) return;

        removeHidingZones();

        const stationColor = (
            feature: any,
        ): {
            color: string;
            fillColor: string;
            fillOpacity: number;
        } => {
            const osmId: string | undefined =
                feature?.properties?.properties?.id;
            const info = statusLookup?.(osmId);
            if (!info) {
                return {
                    color: "green",
                    fillColor: "green",
                    fillOpacity: 0.2,
                };
            }
            // Overrides win visually too, so the user sees their own
            // decision reflected on the map.
            if (info.override === "include") {
                return {
                    color: "#059669", // emerald-600
                    fillColor: "#10b981", // emerald-500
                    fillOpacity: 0.3,
                };
            }
            if (info.override === "exclude") {
                return {
                    color: "#64748b", // slate-500
                    fillColor: "#94a3b8", // slate-400
                    fillOpacity: 0.15,
                };
            }
            switch (info.status) {
                case "reachable":
                    return {
                        color: "green",
                        fillColor: "green",
                        fillOpacity: 0.2,
                    };
                case "unknown":
                    return {
                        color: "#d97706", // amber-600
                        fillColor: "#f59e0b", // amber-500
                        fillOpacity: 0.25,
                    };
                case "unreachable":
                    return {
                        color: "#dc2626", // red-600
                        fillColor: "#ef4444", // red-500
                        fillOpacity: 0.2,
                    };
            }
        };

        const geoJsonLayer = L.geoJSON(geoJSONData, {
            style: statusLookup
                ? (feature) => stationColor(feature)
                : {
                      color: "green",
                      fillColor: "green",
                      fillOpacity: 0.2,
                  },
            onEachFeature: nonOverlappingStations
                ? (feature, layer) => {
                      layer.on("click", async () => {
                          if (!map) return;

                          setHidingZoneModeStationID(
                              feature.properties.properties.id,
                          );
                      });
                  }
                : undefined,
            pointToLayer(geoJsonPoint, latlng) {
                // For marker styles, statusLookup lets us tint the
                // icon so unknown stations pop visually. Falls back
                // to the original black-on-transparent icon when
                // reachability isn't active.
                const osmId: string | undefined = (geoJsonPoint as any)
                    ?.properties?.properties?.id;
                const info = statusLookup?.(osmId);
                const tint = !info
                    ? "text-black"
                    : info.override === "include"
                      ? "text-emerald-600"
                      : info.override === "exclude"
                        ? "text-slate-500"
                        : info.status === "unknown"
                          ? "text-amber-500"
                          : info.status === "unreachable"
                            ? "text-red-500"
                            : "text-black";

                const marker = L.marker(latlng, {
                    icon: L.divIcon({
                        html: `<div class="${tint} bg-transparent"><svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg"><path d="M96 0C43 0 0 43 0 96L0 352c0 48 35.2 87.7 81.1 94.9l-46 46C28.1 499.9 33.1 512 43 512l39.7 0c8.5 0 16.6-3.4 22.6-9.4L160 448l128 0 54.6 54.6c6 6 14.1 9.4 22.6 9.4l39.7 0c10 0 15-12.1 7.9-19.1l-46-46c46-7.1 81.1-46.9 81.1-94.9l0-256c0-53-43-96-96-96L96 0zM64 96c0-17.7 14.3-32 32-32l256 0c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32L96 224c-17.7 0-32-14.3-32-32l0-96zM224 288a48 48 0 1 1 0 96 48 48 0 1 1 0-96z"></path></svg></div>`,
                        className: "",
                    }),
                });

                const statusText = info
                    ? info.override
                        ? ` · forced ${info.override}`
                        : info.status === "reachable"
                          ? " · reachable"
                          : info.status === "unknown"
                            ? " · unknown (no GTFS match)"
                            : " · unreachable"
                    : "";
                marker.bindPopup(
                    `<b>${
                        extractStationName(geoJsonPoint) || "No Name Found"
                    } (${lngLatToText(
                        geoJsonPoint.geometry.coordinates as [number, number],
                    )})</b>${statusText}`,
                );

                return marker;
            },
            ...additionalOptions,
        });

        // @ts-expect-error This is intentionally added as a check
        geoJsonLayer.hidingZones = true;

        geoJsonLayer.addTo(map);
    };

    // Precompute the unionized, simplified holed-mask and its playable
    // bbox once per questionFinishedMapData change. Both are consumed
    // by Phase B, and both are expensive enough (turf.simplify + union
    // over a world polygon with many holes) that we want to avoid
    // redoing them on every re-run.
    const zoneMaskMemo = useMemo(() => {
        if (!$questionFinishedMapData) {
            return { unionized: null, playableBbox: null };
        }
        const unionized = safeUnion(
            turf.simplify($questionFinishedMapData, { tolerance: 0.001 }),
        );
        const playableBbox = playableBboxFromHoledMask(
            $questionFinishedMapData,
        );
        return { unionized, playableBbox };
    }, [$questionFinishedMapData]);

    // ------------------------------------------------------------------
    // Phase A: fetch + merge + circle-build.
    //
    // Runs only when the *scope* or *station options* change — NOT on
    // every question edit. The expensive bits here (Overpass fetch,
    // osmtogeojson parse, mergeDuplicateStation, circle construction)
    // are kept cached in `rawCircles` state so Phase B can filter
    // cheaply on every question change.
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!map) return;
        if (!$displayHidingZones) return;

        if (hidingZoneLoadingRef.current) {
            pendingRefreshRef.current = true;
            return;
        }

        const fetchRawCircles = async () => {
            hidingZoneLoadingRef.current = true;
            isLoading.set(true);
            setIsHidingZoneLoading(true);

            const markLabel = "ZoneSidebar/PhaseA";
            if (import.meta.env.DEV) console.time(markLabel);

            try {
                const needsDefault =
                    !useCustomStations || includeDefaultStations;
                if (needsDefault && $displayHidingZonesOptions.length === 0) {
                    toast.error("At least one place type must be selected");
                    return;
                }

                let places: StationPlace[];

                if (!needsDefault) {
                    places = normalizeToStationFeatures(
                        $customStations,
                    ).features.map((f) => ({
                        type: "Feature",
                        geometry: f.geometry,
                        properties: {
                            id:
                                f.properties?.id ||
                                `${(f.geometry as any).coordinates[1]},${(f.geometry as any).coordinates[0]}`,
                            name: f.properties?.name,
                        },
                    }));
                } else {
                    const activeFilter = activeStationsOnly
                        ? OVERPASS_ACTIVE_RAIL_STATION_EXCLUSIONS
                        : "";
                    const stationOptions = $displayHidingZonesOptions.map(
                        (opt) => `${opt}${activeFilter}`,
                    );
                    // @ts-expect-error osmtogeojson always defines properties with an "id" string
                    places = osmtogeojson(
                        await findPlacesInZone(
                            stationOptions[0],
                            "Finding stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
                            "nwr",
                            "center",
                            stationOptions.slice(1),
                            240,
                        ),
                    ).features;

                    if (
                        useCustomStations &&
                        $customStations.length > 0 &&
                        includeDefaultStations
                    ) {
                        const customFeatures = normalizeToStationFeatures(
                            $customStations,
                        ).features.map(
                            (f) =>
                                ({
                                    type: "Feature",
                                    geometry: f.geometry,
                                    properties: {
                                        id:
                                            f.properties?.id ||
                                            `${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}`,
                                        name: f.properties?.name,
                                    },
                                }) as StationPlace,
                        );
                        const seen = new Set<string>();
                        const merged: StationPlace[] = [];
                        const add = (feat: StationPlace) => {
                            const id = feat.properties.id as string | undefined;
                            const key =
                                id && id.includes("/")
                                    ? `id:${id}`
                                    : `pt:${feat.geometry.coordinates[1]},${feat.geometry.coordinates[0]}`;
                            if (!seen.has(key)) {
                                seen.add(key);
                                merged.push(feat);
                            }
                        };
                        places.forEach(add);
                        customFeatures.forEach(add);
                        places = merged;
                    }
                }

                // Heritage / tourist railway exclusion. Station nodes
                // themselves rarely carry the heritage tag; it lives on
                // the parent way. So we fetch the set of node IDs that
                // are members of heritage / preserved / tourism /
                // abandoned railway ways in scope and drop any place
                // whose OSM id matches.
                if (needsDefault && excludeHeritageRailways) {
                    try {
                        const heritageNodeIds =
                            await findHeritageRailwayMemberNodeIds();
                        if (heritageNodeIds.size > 0) {
                            places = places.filter((place) => {
                                const idStr = place.properties?.id;
                                if (typeof idStr !== "string") return true;
                                const slash = idStr.indexOf("/");
                                if (slash < 0) return true;
                                // Only OSM node ids live on railway
                                // ways; OSM way / relation station
                                // entries don't. Leave non-node places
                                // alone.
                                if (idStr.slice(0, slash) !== "node")
                                    return true;
                                const num = Number(idStr.slice(slash + 1));
                                return !heritageNodeIds.has(num);
                            });
                        }
                    } catch (err) {
                        console.log(
                            "Heritage railway filter failed; keeping all stations:",
                            err,
                        );
                        // User asked to exclude heritage/tourist lines but
                        // the Overpass call died — tell them the filter
                        // didn't run instead of silently including heritage
                        // stations and looking like the toggle is broken.
                        toast.warning(
                            "Couldn't load heritage-railway data (Overpass may be rate-limited); heritage stations were NOT filtered out.",
                            {
                                toastId: "heritage-filter-failed",
                                autoClose: 8000,
                            },
                        );
                    }
                }

                if (mergeDuplicates) {
                    places = mergeDuplicateStation(
                        places,
                        $hidingRadius,
                        $hidingRadiusUnits,
                    );
                }

                const circles = buildCirclesFromPlaces(places, {
                    radius: $hidingRadius,
                    units: $hidingRadiusUnits,
                });

                setRawCircles(circles);
            } finally {
                hidingZoneLoadingRef.current = false;
                isLoading.set(false);
                setIsHidingZoneLoading(false);
                if (import.meta.env.DEV) console.timeEnd(markLabel);

                if (pendingRefreshRef.current) {
                    pendingRefreshRef.current = false;
                    fetchRawCircles().catch((error) => {
                        console.log(
                            "Error in hiding zone initialization:",
                            error,
                        );
                        toast.error(
                            "An error occurred during hiding zone initialization",
                            { toastId: "hiding-zone-initialization-error" },
                        );
                    });
                }
            }
        };

        fetchRawCircles().catch((error) => {
            console.log("Error in hiding zone initialization:", error);
            toast.error("An error occurred during hiding zone initialization", {
                toastId: "hiding-zone-initialization-error",
            });
        });
    }, [
        map,
        $displayHidingZones,
        $displayHidingZonesOptions,
        $hidingRadius,
        $hidingRadiusUnits,
        useCustomStations,
        includeDefaultStations,
        $customStations,
        mergeDuplicates,
        activeStationsOnly,
        excludeHeritageRailways,
        $polyGeoJSON,
        $mapGeoLocation,
        $additionalMapGeoLocations,
    ]);

    // ------------------------------------------------------------------
    // Phase A.5: OSM ↔ GTFS match bundle.
    //
    // Runs only when a reachability query has actually been executed
    // (`$reachabilityResult` is non-null) AND we have raw circles to
    // match against. No network work — just IDB reads + in-memory
    // matching. Generation-counter guarded so an older bundle can't
    // overwrite a newer one.
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!rawCircles || rawCircles.length === 0) {
            setReachabilityBundle(null);
            return;
        }
        if (!$reachabilityResult) {
            // Reachability hasn't been queried yet; don't load GTFS.

            setReachabilityBundle(null);
            return;
        }

        const gen = ++bundleGenRef.current;
        let cancelled = false;

        (async () => {
            const markLabel = "ZoneSidebar/ReachBundle";
            if (import.meta.env.DEV) console.time(markLabel);
            try {
                const stops = await getAllStops(
                    $reachabilityResult.query.systemIds,
                );
                if (cancelled || gen !== bundleGenRef.current) return;

                const index = buildStopIndex(stops);

                const osmInputs: OsmStationInput[] = rawCircles
                    .map((circle): OsmStationInput | null => {
                        const place = circle.properties;
                        const osmId = place.properties?.id;
                        const name = place.properties?.name;
                        if (typeof osmId !== "string") return null;
                        const [lng, lat] = turf.getCoord(place);
                        return {
                            osmId,
                            name: typeof name === "string" ? name : "",
                            lat,
                            lng,
                            // Raw OSM tags live under place.properties
                            // when we came from Overpass. Passing the
                            // whole property bag is fine — the matcher
                            // only reads a short allowlist of keys.
                            tags: place.properties as Record<
                                string,
                                string | undefined
                            >,
                        };
                    })
                    .filter((v): v is OsmStationInput => v !== null);

                const matched = matchOsmToGtfs(osmInputs, index);
                if (cancelled || gen !== bundleGenRef.current) return;

                const matches = new Map<string, MatchedStation>();
                for (const m of matched) matches.set(m.osmId, m);

                setReachabilityBundle({ matches, stopById: index.byId });
            } catch (err) {
                if (!cancelled) {
                    console.log("Reachability bundle build failed:", err);
                    // Silent degradation here would leave the station filter
                    // silently stale vs. GTFS — surface it so the user knows
                    // classifications may be wrong. Dedup by toastId so a
                    // flapping effect can't spam the UI.
                    toast.error(
                        "Couldn't match stations to GTFS stops; reachability results may be stale.",
                        {
                            toastId: "reachability-bundle-failed",
                            autoClose: 6000,
                        },
                    );
                }
            } finally {
                if (import.meta.env.DEV) console.timeEnd(markLabel);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [rawCircles, $reachabilityResult]);

    // ------------------------------------------------------------------
    // Phase B: zone cull + question-driven filters.
    //
    // Runs on every question edit. No network work except for
    // already-cached Overpass calls for measuring POIs (McDonald's /
    // 7-Eleven) and train-line lookup, both of which are parallelized
    // / deduped via the helpers in `zonePipeline.ts`.
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!map) return;
        if (!$displayHidingZones) return;
        if (rawCircles === null) return;
        if (!$questionFinishedMapData) return;

        const { unionized, playableBbox } = zoneMaskMemo;
        if (!unionized) return;

        const gen = ++filterGenRef.current;

        const run = async () => {
            const markLabel = import.meta.env.DEV
                ? `ZoneSidebar/PhaseB#${gen}`
                : "";
            if (import.meta.env.DEV) console.time(markLabel);
            try {
                const culled = cullCirclesAgainstZone(rawCircles, {
                    playableBbox,
                    unionizedMask: unionized,
                    radiusKm: turf.convertLength(
                        $hidingRadius,
                        $hidingRadiusUnits,
                        "kilometers",
                    ),
                });

                const currentQuestions = questions.get();
                const matchingZoneKey = overpassZoneCacheKey();
                const [measuringPoiCache, matchingFacilityCache] =
                    await Promise.all([
                        prefetchMeasuringPoiPoints(currentQuestions),
                        prefetchMatchingFacilityPoints(
                            currentQuestions,
                            matchingZoneKey,
                        ),
                    ]);
                if (gen !== filterGenRef.current) {
                    return;
                }

                const filtered = await applyQuestionFilters({
                    circles: culled,
                    questions: currentQuestions,
                    measuringPoiCache,
                    matchingFacilityCache,
                    matchingZoneKey,
                    hidingRadius: $hidingRadius,
                    useCustomStations,
                    includeDefaultStations,
                    planningModeEnabled: planningModeEnabled.get(),
                    toast,
                });
                if (gen !== filterGenRef.current) {
                    return;
                }

                // Reachability filter (Phase 3). Only runs if the user has
                // executed a reachability query and the OSM↔GTFS match
                // bundle has been built. Overrides always win and can be
                // set even without a query — we still need the arrivals
                // map for the classification-based keep/drop decision, so
                // skip entirely when no result is present.
                let final = filtered;
                if ($reachabilityResult && reachabilityBundle) {
                    const overridesMap = new Map<string, "include" | "exclude">(
                        Object.entries($reachabilityOverrides),
                    );
                    const { filtered: reachFiltered, classifications } =
                        filterCirclesByReachability({
                            circles: filtered,
                            matches: reachabilityBundle.matches,
                            arrivalsByStopId:
                                $reachabilityResult.arrivalSeconds,
                            stopById: reachabilityBundle.stopById,
                            budgetMinutes:
                                $reachabilityResult.query.budgetMinutes,
                            overrides: overridesMap,
                            unknownDefault: "include",
                        });
                    final = reachFiltered;
                    reachabilityClassifications.set(classifications);
                } else {
                    // No active query → clear stale classifications so the
                    // sidebar doesn't show status badges from an old run.
                    reachabilityClassifications.set(new Map());
                }

                setStations(final);
            } finally {
                if (import.meta.env.DEV) console.timeEnd(markLabel);
            }
        };

        run().catch((error) => {
            console.log("Error in hiding zone filter pass:", error);
            toast.error("An error occurred during hiding zone filtering", {
                toastId: "hiding-zone-filter-error",
            });
        });
    }, [
        map,
        $displayHidingZones,
        rawCircles,
        $questionFinishedMapData,
        zoneMaskMemo,
        $hidingRadius,
        $hidingRadiusUnits,
        useCustomStations,
        includeDefaultStations,
        setStations,
        $reachabilityResult,
        $reachabilityOverrides,
        reachabilityBundle,
        $questions,
        $triggerLocalRefresh,
    ]);

    // Active stations after disabled-station filtering. Derived; cheap.
    const activeStations = useMemo(
        () =>
            stations.filter(
                (x) => !$disabledStations.includes(x.properties.properties.id),
            ),
        [stations, $disabledStations],
    );

    // Memoize the styled GeoJSON. `styleStations` with the
    // `no-overlap` style runs `turf.union` across every circle, which
    // is O(N log N) at best and noticeable at a few hundred circles.
    // Key on a stable signature so unrelated store changes
    // (hidingZoneModeStationID, planning-mode flags) don't redo the
    // union. We intentionally exclude `activeStations` identity so a
    // re-filter that produces the same set doesn't re-run union.
    const activeStationsSignature = stationsSignature(
        activeStations,
        $hidingRadius,
        $hidingRadiusUnits,
    );
    const styledGeoJSON = useMemo(
        () =>
            styleStations(
                activeStations,
                $displayHidingZonesStyle,
                $hidingRadius,
                $hidingRadiusUnits,
            ),

        [activeStationsSignature, $displayHidingZonesStyle],
    );

    useEffect(() => {
        if (!map || isLoading.get()) return;

        if ($displayHidingZones && hidingZoneModeStationID) {
            const hiderStation = _.find(
                stations,
                (c) => c.properties.properties.id === hidingZoneModeStationID,
            );

            if (hiderStation !== undefined) {
                selectionProcess(
                    hiderStation,
                    map,
                    stations,
                    showGeoJSON,
                    $questionFinishedMapData,
                    $hidingRadius,
                ).catch((error) => {
                    console.log("Error in hiding zone selection:", error);
                    toast.error(
                        "An error occurred during hiding zone selection",
                        { toastId: "hiding-zone-selection-error" },
                    );
                });
            } else {
                toast.error("Invalid hiding zone selected", {
                    toastId: "hiding-zone-selection-error",
                });
            }
        } else if ($displayHidingZones) {
            // Only supply a status lookup when reachability is
            // actually active — otherwise the default green look
            // from before this feature landed is what we want.
            const statusLookup = $reachabilityResult
                ? (osmId: string | undefined) => {
                      if (!osmId) return undefined;
                      const status = $reachabilityClassifications.get(osmId);
                      if (!status) return undefined;
                      return {
                          status,
                          override: $reachabilityOverrides[osmId],
                      };
                  }
                : undefined;
            showGeoJSON(
                styledGeoJSON,
                $displayHidingZonesStyle === "zones",
                {},
                statusLookup,
            );
        } else {
            removeHidingZones();
        }
        // `map`, `showGeoJSON`, `removeHidingZones` are stable per mount
        // (map is a Leaflet instance captured once; the two functions
        // are component-module scoped). Re-running on their identity
        // would needlessly redraw the GeoJSON layer.
    }, [
        $displayHidingZones,
        $displayHidingZonesStyle,
        $hidingRadius,
        $questionFinishedMapData,
        hidingZoneModeStationID,
        stations,
        styledGeoJSON,
        $reachabilityResult,
        $reachabilityClassifications,
        $reachabilityOverrides,
    ]);

    return (
        <Sidebar side="right">
            <div
                className="flex items-center justify-between"
                data-hiding-zone-raw={
                    rawCircles === null ? "null" : String(rawCircles.length)
                }
                data-hiding-zone-reachability-bundle={
                    reachabilityBundle ? "ready" : "none"
                }
            >
                <h2 className="ml-4 mt-4 font-poppins text-2xl">Hiding Zone</h2>
                <SidebarCloseIcon
                    className="mr-2 visible md:hidden scale-x-[-1]"
                    onClick={() => {
                        rightSidebar.setOpenMobile(false);
                    }}
                />
            </div>
            <SidebarContent ref={sidebarRef}>
                <ScrollToTop element={sidebarRef} minHeight={500} />
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => {
                                        // Mobile: swap drawers so users can
                                        // return to question editing directly.
                                        rightSidebar.setOpenMobile(false);
                                        if (leftSidebar.isMobile) {
                                            leftSidebar.setOpenMobile(true);
                                        } else {
                                            leftSidebar.setOpen(true);
                                        }
                                    }}
                                    disabled={$isLoading}
                                >
                                    Back to Questions
                                </Button>
                            </SidebarMenuItem>
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <Label className="font-semibold font-poppins flex items-center gap-1.5">
                                    Display hiding zones?
                                    {isHidingZoneLoading && (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
                                    )}
                                </Label>
                                <Checkbox
                                    defaultChecked={$displayHidingZones}
                                    checked={$displayHidingZones}
                                    onCheckedChange={displayHidingZones.set}
                                    disabled={$isLoading}
                                />
                            </SidebarMenuItem>
                            <SidebarMenuItem
                                className={cn(
                                    MENU_ITEM_CLASSNAME,
                                    "text-orange-500",
                                )}
                            >
                                Warning: This feature can drastically slow down
                                your device.
                            </SidebarMenuItem>
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <div className="flex flex-row items-center justify-between w-full">
                                    <Label className="font-semibold font-poppins flex items-center gap-1.5">
                                        Use custom station list?
                                        {isHidingZoneLoading && (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
                                        )}
                                    </Label>
                                    <Checkbox
                                        checked={useCustomStations}
                                        onCheckedChange={(v) =>
                                            useCustomStationsAtom.set(!!v)
                                        }
                                        disabled={$isLoading}
                                    />
                                </div>
                            </SidebarMenuItem>
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <div className="flex flex-row items-center justify-between w-full">
                                    <Label className="font-semibold font-poppins flex items-center gap-1.5">
                                        Merge duplicated stations?
                                        {isHidingZoneLoading && (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
                                        )}
                                    </Label>
                                    <Checkbox
                                        checked={mergeDuplicates}
                                        onCheckedChange={(v) =>
                                            mergeDuplicatesAtom.set(!!v)
                                        }
                                        disabled={$isLoading}
                                    />
                                </div>
                            </SidebarMenuItem>
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <div className="flex flex-row items-center justify-between w-full">
                                    <Label className="font-semibold font-poppins flex items-center gap-1.5">
                                        Active stations only?
                                        {isHidingZoneLoading && (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
                                        )}
                                    </Label>
                                    <Checkbox
                                        checked={activeStationsOnly}
                                        onCheckedChange={(v) =>
                                            activeStationsOnlyAtom.set(!!v)
                                        }
                                        disabled={$isLoading}
                                    />
                                </div>
                            </SidebarMenuItem>
                            <SidebarMenuItem
                                className={cn(
                                    MENU_ITEM_CLASSNAME,
                                    "text-xs text-muted-foreground leading-4 -mt-1",
                                )}
                            >
                                Filters out disused / suspended stops and
                                lifecycle-tagged stations (
                                <span className="font-mono text-[0.85em]">
                                    disused:railway
                                </span>
                                , etc.). Turn off to match raw OSM (e.g. if a
                                closed stop is still tagged like an active
                                station).
                            </SidebarMenuItem>
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <div className="flex flex-row items-center justify-between w-full">
                                    <Label className="font-semibold font-poppins flex items-center gap-1.5">
                                        Exclude heritage / tourist railways?
                                        {isHidingZoneLoading && (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
                                        )}
                                    </Label>
                                    <Checkbox
                                        checked={excludeHeritageRailways}
                                        onCheckedChange={(v) =>
                                            excludeHeritageRailwaysAtom.set(!!v)
                                        }
                                        disabled={$isLoading}
                                    />
                                </div>
                            </SidebarMenuItem>
                            <SidebarMenuItem
                                className={cn(
                                    MENU_ITEM_CLASSNAME,
                                    "text-xs text-muted-foreground leading-4 -mt-1",
                                )}
                            >
                                Drops stops on preserved / tourism / abandoned
                                railway lines. Leave off for one-way scenic
                                routes like Durango–Silverton or Cuyahoga Valley
                                Scenic, where stations are still meaningful
                                hiding spots.
                            </SidebarMenuItem>
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <TransitSystemsButton
                                    className="w-full"
                                    variant="outline"
                                >
                                    Manage transit systems…
                                </TransitSystemsButton>
                            </SidebarMenuItem>
                            <ReachabilitySection />
                            {useCustomStations && (
                                <>
                                    <SidebarMenuItem
                                        className={MENU_ITEM_CLASSNAME}
                                    >
                                        <div className="flex flex-col gap-2 w-full">
                                            <Label className="font-semibold font-poppins leading-5">
                                                Import stations from URL (CSV,
                                                GeoJSON, KML). This must be a
                                                raw file link.
                                            </Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="https://..."
                                                    value={importUrl}
                                                    onChange={(e) =>
                                                        setImportUrl(
                                                            e.target.value,
                                                        )
                                                    }
                                                    disabled={$isLoading}
                                                />
                                                <button
                                                    className="bg-blue-600 text-white px-3 rounded-md"
                                                    disabled={$isLoading}
                                                    onClick={async () => {
                                                        if (!importUrl) return;
                                                        try {
                                                            const res =
                                                                await fetch(
                                                                    importUrl,
                                                                );
                                                            const contentType =
                                                                res.headers.get(
                                                                    "content-type",
                                                                ) || undefined;
                                                            const text =
                                                                await res.text();
                                                            const parsed =
                                                                parseCustomStationsFromText(
                                                                    text,
                                                                    contentType ||
                                                                        undefined,
                                                                );
                                                            if (
                                                                parsed.length ===
                                                                0
                                                            ) {
                                                                toast.error(
                                                                    "No stations found in provided URL",
                                                                );
                                                                return;
                                                            }
                                                            customStationsAtom.set(
                                                                parsed,
                                                            );
                                                            toast.success(
                                                                `Imported ${parsed.length} stations`,
                                                            );
                                                        } catch (e: any) {
                                                            toast.error(
                                                                `Failed to import from URL: ${e.message || e}`,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    Import
                                                </button>
                                            </div>
                                            <div>
                                                <Input
                                                    type="file"
                                                    multiple
                                                    accept=".csv,.json,.geojson,.kml,application/json,application/vnd.google-earth.kml+xml,text/csv,application/vnd.google-apps.kml+xml,application/xml,text/xml"
                                                    onInput={async (e) => {
                                                        const files = (
                                                            e.target as HTMLInputElement
                                                        ).files;
                                                        if (
                                                            !files ||
                                                            files.length === 0
                                                        )
                                                            return;
                                                        try {
                                                            const all: any[] =
                                                                [];
                                                            for (const file of Array.from(
                                                                files,
                                                            )) {
                                                                const text =
                                                                    await file.text();
                                                                const parsed =
                                                                    parseCustomStationsFromText(
                                                                        text,
                                                                        file.type,
                                                                    );
                                                                all.push(
                                                                    ...parsed,
                                                                );
                                                            }
                                                            if (
                                                                all.length === 0
                                                            ) {
                                                                toast.error(
                                                                    "No stations found in uploaded files",
                                                                );
                                                                return;
                                                            }
                                                            const byKey =
                                                                new Map<
                                                                    string,
                                                                    any
                                                                >();
                                                            for (const s of all) {
                                                                const key =
                                                                    s.id &&
                                                                    s.id.includes(
                                                                        "/",
                                                                    )
                                                                        ? `id:${s.id}`
                                                                        : `pt:${s.lat},${s.lng}`;
                                                                if (
                                                                    !byKey.has(
                                                                        key,
                                                                    )
                                                                )
                                                                    byKey.set(
                                                                        key,
                                                                        s,
                                                                    );
                                                            }
                                                            const unique =
                                                                Array.from(
                                                                    byKey.values(),
                                                                );
                                                            customStationsAtom.set(
                                                                unique,
                                                            );
                                                            toast.success(
                                                                `Imported ${unique.length} stations`,
                                                            );
                                                        } catch (e: any) {
                                                            toast.error(
                                                                `Failed to import files: ${e.message || e}`,
                                                            );
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div className="flex flex-row items-center justify-between w-full">
                                                <Label className="font-semibold font-poppins">
                                                    Include default stations
                                                    with custom list?
                                                </Label>
                                                <Checkbox
                                                    checked={
                                                        includeDefaultStations
                                                    }
                                                    onCheckedChange={(v) =>
                                                        includeDefaultStationsAtom.set(
                                                            !!v,
                                                        )
                                                    }
                                                    disabled={$isLoading}
                                                />
                                            </div>
                                            {$customStations.length > 0 && (
                                                <div className="text-sm text-gray-300">
                                                    {_previewText(
                                                        $customStations.length,
                                                    )}
                                                </div>
                                            )}
                                            {$customStations.length > 0 && (
                                                <div className="flex gap-2">
                                                    <Button
                                                        className="w-full"
                                                        onClick={() =>
                                                            customStationsAtom.set(
                                                                [],
                                                            )
                                                        }
                                                    >
                                                        Clear Imported
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </SidebarMenuItem>
                                </>
                            )}
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <MultiSelect
                                    options={[
                                        {
                                            label: "Railway Stations",
                                            value: "[railway=station]",
                                        },
                                        {
                                            label: "Railway Halts",
                                            value: "[railway=halt]",
                                        },
                                        {
                                            label: "Railway Stops",
                                            value: "[railway=stop]",
                                        },
                                        {
                                            label: "Tram Stops",
                                            value: "[railway=tram_stop]",
                                        },
                                        {
                                            label: "Bus Stops",
                                            value: "[highway=bus_stop]",
                                        },
                                        {
                                            label: "Ferry Terminals",
                                            value: "[amenity=ferry_terminal]",
                                        },
                                        {
                                            label: "Ferry Platforms (public transport)",
                                            value: "[public_transport=platform][platform=ferry]",
                                        },
                                        {
                                            label: "Funicular Stations",
                                            value: "[railway=funicular]",
                                        },
                                        {
                                            label: "Aerialway Stations",
                                            value: "[aerialway=station]",
                                        },
                                        {
                                            label: "Railway Stations Excluding Subways",
                                            value: "[railway=station][subway!=yes]",
                                        },
                                        {
                                            label: "Subway Stations",
                                            value: "[railway=station][subway=yes]",
                                        },
                                        {
                                            label: "Light Rail Stations",
                                            value: "[railway=station][light_rail=yes]",
                                        },
                                        {
                                            label: "Light Rail Halts",
                                            value: "[railway=halt][light_rail=yes]",
                                        },
                                    ]}
                                    onValueChange={
                                        displayHidingZonesOptions.set
                                    }
                                    defaultValue={$displayHidingZonesOptions}
                                    placeholder="Select allowed places"
                                    animation={2}
                                    maxCount={3}
                                    modalPopover
                                    className="bg-popover!"
                                    disabled={
                                        $isLoading ||
                                        (useCustomStations &&
                                            !includeDefaultStations)
                                    }
                                />
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <Label className="font-semibold font-poppins ml-2">
                                    Hiding Zone Radius
                                </Label>
                                <div
                                    className={cn(
                                        MENU_ITEM_CLASSNAME,
                                        "gap-2 flex flex-row",
                                    )}
                                >
                                    <Input
                                        type="number"
                                        className="rounded-md p-2 w-16"
                                        value={$hidingRadius}
                                        onChange={(e) => {
                                            hidingRadius.set(
                                                parseFloat(e.target.value),
                                            );
                                        }}
                                        disabled={$isLoading}
                                    />
                                    <UnitSelect
                                        unit={$hidingRadiusUnits}
                                        disabled={$isLoading}
                                        onChange={(unit) => {
                                            hidingRadiusUnits.set(unit);
                                        }}
                                    />
                                </div>
                            </SidebarMenuItem>
                            {$displayHidingZones && stations.length > 0 && (
                                <SidebarMenuItem
                                    className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-hidden data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                    onClick={() => {
                                        setHidingZoneModeStationID("");
                                        displayHidingZonesStyle.set(
                                            "no-display",
                                        );
                                    }}
                                    disabled={$isLoading}
                                >
                                    No Display
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && stations.length > 0 && (
                                <SidebarMenuItem
                                    className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-hidden data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                    onClick={() => {
                                        setHidingZoneModeStationID("");
                                        displayHidingZonesStyle.set("stations");
                                    }}
                                    disabled={$isLoading}
                                >
                                    All Stations
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && stations.length > 0 && (
                                <SidebarMenuItem
                                    className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-hidden data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                    onClick={() => {
                                        setHidingZoneModeStationID("");
                                        displayHidingZonesStyle.set("zones");
                                    }}
                                    disabled={$isLoading}
                                >
                                    All Zones
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && stations.length > 0 && (
                                <SidebarMenuItem
                                    className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-hidden data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                    onClick={() => {
                                        setHidingZoneModeStationID("");
                                        displayHidingZonesStyle.set(
                                            "no-overlap",
                                        );
                                    }}
                                    disabled={$isLoading}
                                >
                                    No Overlap
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && hidingZoneModeStationID && (
                                <SidebarMenuItem
                                    className={cn(
                                        MENU_ITEM_CLASSNAME,
                                        "bg-popover hover:bg-accent",
                                    )}
                                    disabled={$isLoading}
                                >
                                    Current:{" "}
                                    {(() => {
                                        const selected = stations.find(
                                            (x) =>
                                                x.properties.properties.id ===
                                                hidingZoneModeStationID,
                                        );
                                        const displayName = extractStationLabel(
                                            selected?.properties,
                                        );
                                        const id = selected?.properties
                                            .properties.id as string;
                                        const coords = selected?.properties
                                            .geometry.coordinates as [
                                            number,
                                            number,
                                        ];
                                        const href = id?.includes("/")
                                            ? `https://www.openstreetmap.org/${id}`
                                            : `https://www.openstreetmap.org/?mlat=${coords[1]}&mlon=${coords[0]}#map=17/${coords[1]}/${coords[0]}`;
                                        return (
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-500"
                                            >
                                                {displayName}
                                            </a>
                                        );
                                    })()}
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones &&
                                $disabledStations.length > 0 && (
                                    <SidebarMenuItem
                                        className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-hidden data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                        onClick={() => {
                                            disabledStations.set([]);
                                        }}
                                        disabled={$isLoading}
                                    >
                                        Clear Disabled
                                    </SidebarMenuItem>
                                )}
                            {$displayHidingZones && (
                                <SidebarMenuItem
                                    className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-hidden data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                    onClick={() => {
                                        disabledStations.set(
                                            stations.map(
                                                (x) =>
                                                    x.properties.properties.id,
                                            ),
                                        );
                                    }}
                                    disabled={$isLoading}
                                >
                                    Disable All
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && (
                                <Command
                                    key={
                                        isStationSearchActive
                                            ? "station-search-active"
                                            : "station-search-idle"
                                    }
                                    shouldFilter={isStationSearchActive}
                                >
                                    <CommandInput
                                        placeholder="Search for a hiding zone..."
                                        value={stationSearch}
                                        onValueChange={setStationSearch}
                                        disabled={$isLoading}
                                    />
                                    <CommandList className="max-h-full">
                                        <CommandEmpty>
                                            No hiding zones found.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {stations.map((station) => (
                                                <CommandItem
                                                    key={
                                                        station.properties
                                                            .properties.id
                                                    }
                                                    data-station-id={
                                                        station.properties
                                                            .properties.id
                                                    }
                                                    className={cn(
                                                        $disabledStations.includes(
                                                            station.properties
                                                                .properties.id,
                                                        ) && "line-through",
                                                    )}
                                                    onSelect={async () => {
                                                        if (!map) return;

                                                        setTimeout(() => {
                                                            if (
                                                                buttonJustClicked
                                                            ) {
                                                                buttonJustClicked = false;
                                                                return;
                                                            }

                                                            if (
                                                                $disabledStations.includes(
                                                                    station
                                                                        .properties
                                                                        .properties
                                                                        .id,
                                                                )
                                                            ) {
                                                                disabledStations.set(
                                                                    [
                                                                        ...$disabledStations.filter(
                                                                            (
                                                                                x,
                                                                            ) =>
                                                                                x !==
                                                                                station
                                                                                    .properties
                                                                                    .properties
                                                                                    .id,
                                                                        ),
                                                                    ],
                                                                );
                                                            } else {
                                                                disabledStations.set(
                                                                    [
                                                                        ...$disabledStations,
                                                                        station
                                                                            .properties
                                                                            .properties
                                                                            .id,
                                                                    ],
                                                                );
                                                            }

                                                            setStations([
                                                                ...stations,
                                                            ]);
                                                        }, 100);
                                                    }}
                                                    disabled={$isLoading}
                                                >
                                                    <span className="flex-1 truncate">
                                                        {extractStationLabel(
                                                            station.properties,
                                                        )}
                                                    </span>
                                                    {$reachabilityResult && (
                                                        <StationReachabilityControl
                                                            osmId={
                                                                station
                                                                    .properties
                                                                    .properties
                                                                    .id
                                                            }
                                                            status={
                                                                $reachabilityClassifications.get(
                                                                    station
                                                                        .properties
                                                                        .properties
                                                                        .id,
                                                                ) ?? "unknown"
                                                            }
                                                            override={
                                                                $reachabilityOverrides[
                                                                    station
                                                                        .properties
                                                                        .properties
                                                                        .id
                                                                ]
                                                            }
                                                            disabled={
                                                                $isLoading
                                                            }
                                                        />
                                                    )}
                                                    <button
                                                        onClick={async () => {
                                                            if (!map) return;

                                                            buttonJustClicked = true;

                                                            setHidingZoneModeStationID(
                                                                station
                                                                    .properties
                                                                    .properties
                                                                    .id,
                                                            );
                                                        }}
                                                        className="bg-slate-600 p-0.5 rounded-md"
                                                        disabled={$isLoading}
                                                    >
                                                        View
                                                    </button>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            )}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
};

/**
 * Per-station reachability status badge + override cycle button.
 *
 * Clicking cycles `auto → include → exclude → auto`. The icon reflects
 * the combined (override | status) state so a user who forced-include
 * an unreachable station still sees their decision, not the raw
 * classification. Kept tiny on purpose — the station list already gets
 * crowded at 300+ rows.
 *
 * Status glyphs:
 *   reachable   →  ✓  (green)   "transit reaches this within budget"
 *   unreachable →  ✗  (red)     "transit can't reach this in budget"
 *   unknown     →  ?  (amber)   "no GTFS match found — we can't tell"
 *
 * Override glyphs (when set, take over the color):
 *   include     →  ★  (emerald) "always include"
 *   exclude     →  ⊘  (slate)   "always drop"
 */
function StationReachabilityControl({
    osmId,
    status,
    override,
    disabled,
}: {
    osmId: string;
    status: "reachable" | "unreachable" | "unknown";
    override: "include" | "exclude" | undefined;
    disabled: boolean;
}) {
    const cycleOverride = (
        e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    ) => {
        // Don't let the cmdk row selection trigger on click.
        e.stopPropagation();
        const current = reachabilityOverridesAtom.get();
        const next = { ...current };
        const cur = current[osmId];
        if (cur === undefined) next[osmId] = "include";
        else if (cur === "include") next[osmId] = "exclude";
        else delete next[osmId];
        reachabilityOverridesAtom.set(next);
    };

    let glyph: string;
    let color: string;
    let title: string;
    if (override === "include") {
        glyph = "★";
        color = "bg-emerald-600 text-white";
        title = "Forced include (click to exclude)";
    } else if (override === "exclude") {
        glyph = "⊘";
        color = "bg-slate-500 text-white";
        title = "Forced exclude (click to reset)";
    } else if (status === "reachable") {
        glyph = "✓";
        color = "bg-green-600/80 text-white";
        title = "Reachable (click to force include)";
    } else if (status === "unreachable") {
        glyph = "✗";
        color = "bg-red-600/80 text-white";
        title =
            "Unreachable — shown because it was included manually (click to force include)";
    } else {
        glyph = "?";
        color = "bg-amber-500 text-white";
        title =
            "Unknown — no GTFS match. Click to force include; click again to exclude.";
    }

    return (
        <button
            type="button"
            onClick={cycleOverride}
            disabled={disabled}
            title={title}
            aria-label={title}
            className={cn(
                "h-5 w-5 rounded-md text-xs leading-none font-semibold inline-flex items-center justify-center shrink-0",
                color,
            )}
        >
            {glyph}
        </button>
    );
}

function styleStations(
    circles: StationCircle[],
    style: string,

    _radius: number,

    _units: turf.Units,
): FeatureCollection | Feature {
    switch (style) {
        case "no-display":
            return { type: "FeatureCollection", features: [] };

        case "no-overlap": {
            // Fast-path: union of 0 or 1 circle is trivial; skip the
            // expensive turf.union and just return the circle (or an
            // empty collection).
            if (circles.length === 0) {
                return { type: "FeatureCollection", features: [] };
            }
            if (circles.length === 1) {
                return circles[0];
            }
            return safeUnion(turf.featureCollection(circles));
        }

        case "stations":
            return turf.featureCollection(circles.map((c) => c.properties));

        default:
            return turf.featureCollection(circles);
    }
}

async function selectionProcess(
    station: any,
    map: L.Map,
    stations: any[],
    showGeoJSON: (geoJSONData: any) => void,
    $questionFinishedMapData: any,
    $hidingRadius: number,
) {
    const bbox = turf.bbox(station);

    const bounds: [[number, number], [number, number]] = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
    ];

    let mapData: any = turf.featureCollection([
        safeUnion(
            turf.featureCollection([
                ...$questionFinishedMapData.features,
                turf.mask(station),
            ]),
        ),
    ]);

    for (const question of questions.get()) {
        if (planningModeEnabled.get() && question.data.drag) {
            continue;
        }

        if (
            question.id === "matching" &&
            (question.data.type === "airport" ||
                question.data.type === "major-city" ||
                question.data.type === "custom-points" ||
                question.data.type.endsWith("-full"))
        ) {
            const raw = await findMatchingPlaces(question.data);
            const points = Array.isArray(raw)
                ? turf.featureCollection(raw as any)
                : (raw as FeatureCollection<Point>);

            if (!points || points.features.length === 0) {
                if (
                    question.id === "matching" &&
                    question.data.type === "airport"
                ) {
                    toast.warning(
                        "No commercial airports found in the current territory.",
                        { toastId: "matching-airport-no-points" },
                    );
                }
                continue;
            }
            if (
                question.id === "matching" &&
                question.data.type === "airport" &&
                points.features.length === 1
            ) {
                toast.info(
                    "Only one commercial airport found. 'Same' matches all zones and 'Different' matches none.",
                    { toastId: "matching-airport-single-point" },
                );
            }

            const seekerPoint = turf.point([
                question.data.lng,
                question.data.lat,
            ]);
            const nearestQuestion = turf.nearestPoint(
                seekerPoint,
                points as any,
            );

            const voronoi = geoSpatialVoronoi(
                points as FeatureCollection<Point>,
            );
            const correctPolygon = voronoi.features.find((feature: any) => {
                const siteCoords =
                    feature?.properties?.site?.geometry?.coordinates;
                if (
                    Array.isArray(siteCoords) &&
                    siteCoords.length >= 2 &&
                    typeof siteCoords[0] === "number" &&
                    typeof siteCoords[1] === "number"
                ) {
                    return (
                        turf.distance(
                            turf.point([siteCoords[0], siteCoords[1]]),
                            nearestQuestion,
                            { units: "kilometers" },
                        ) < 0.0001
                    );
                }
                return (
                    feature?.properties?.site?.properties?.name !== undefined &&
                    feature?.properties?.site?.properties?.name ===
                        nearestQuestion.properties?.name
                );
            });

            if (!correctPolygon) {
                if (question.data.same) {
                    mapData = BLANK_GEOJSON;
                }
                continue;
            }

            if (question.data.same) {
                mapData = safeUnion(
                    turf.featureCollection([
                        ...mapData.features,
                        turf.mask(correctPolygon),
                    ]),
                );
            } else {
                mapData = safeUnion(
                    turf.featureCollection([
                        ...mapData.features,
                        correctPolygon,
                    ]),
                );
            }
            continue;
        }

        if (
            (question.id === "measuring" || question.id === "matching") &&
            (question.data.type === "aquarium" ||
                question.data.type === "zoo" ||
                question.data.type === "theme_park" ||
                question.data.type === "peak" ||
                question.data.type === "museum" ||
                question.data.type === "hospital" ||
                question.data.type === "cinema" ||
                question.data.type === "library" ||
                question.data.type === "golf_course" ||
                question.data.type === "consulate" ||
                question.data.type === "park")
        ) {
            const fullType = `${question.data.type}-full`;
            const raw = await findMatchingPlaces({
                ...(question.data as any),
                type: fullType,
            } as any);
            const points = Array.isArray(raw)
                ? turf.featureCollection(raw as any)
                : (raw as FeatureCollection<Point>);
            if (!points || points.features.length === 0) {
                continue;
            }

            const seekerPoint = turf.point([
                question.data.lng,
                question.data.lat,
            ]);
            const nearestQuestion = turf.nearestPoint(
                seekerPoint,
                points as any,
            );

            const distances: any[] = points.features.map((x: any) => {
                return {
                    distance: turf.distance(
                        turf.point(turf.getCoord(x)),
                        station.properties,
                        {
                            units: "miles",
                        },
                    ),
                    point: x,
                };
            });
            const minimumPoint = _.minBy(distances, "distance");
            if (!minimumPoint) {
                continue;
            }

            const nearestPoints = distances
                .filter(
                    (x) =>
                        x.distance <
                            minimumPoint.distance + $hidingRadius * 2 &&
                        x.point.properties.name, // If it doesn't have a name, it's not a valid location
                )
                .map((x) => x.point);
            if (nearestPoints.length === 0) {
                continue;
            }

            if (question.id === "matching") {
                const voronoi = geoSpatialVoronoi(
                    turf.featureCollection(nearestPoints),
                );

                const correctPolygon = voronoi.features.find((feature: any) => {
                    return (
                        feature.properties.site.properties.name ===
                        nearestQuestion.properties.name
                    );
                });

                if (!correctPolygon) {
                    if (question.data.same) {
                        mapData = BLANK_GEOJSON;
                    }

                    continue;
                }

                if (question.data.same) {
                    mapData = safeUnion(
                        turf.featureCollection([
                            ...mapData.features,
                            turf.mask(correctPolygon),
                        ]),
                    );
                } else {
                    mapData = safeUnion(
                        turf.featureCollection([
                            ...mapData.features,
                            correctPolygon,
                        ]),
                    );
                }
            } else {
                const circles = nearestPoints.map((x) =>
                    turf.circle(
                        turf.getCoord(x),
                        nearestQuestion.properties.distanceToPoint,
                    ),
                );

                if (question.data.hiderCloser) {
                    mapData = safeUnion(
                        turf.featureCollection([
                            ...mapData.features,
                            holedMask(turf.featureCollection(circles)),
                        ]),
                    );
                } else {
                    mapData = safeUnion(
                        turf.featureCollection([
                            ...mapData.features,
                            ...circles,
                        ]),
                    );
                }
            }
        }
        if (
            question.id === "measuring" &&
            question.data.type === "rail-measure"
        ) {
            const location = turf.point([question.data.lng, question.data.lat]);

            const nearestTrainStation = turf.nearestPoint(
                location,
                turf.featureCollection(
                    stations.map((x) => x.properties.geometry),
                ),
            );

            const distance = turf.distance(location, nearestTrainStation);

            const circles = stations
                .filter(
                    (x) =>
                        turf.distance(
                            station.properties.geometry,
                            x.properties.geometry,
                        ) <
                        distance + 1.61 * $hidingRadius,
                )
                .map((x) => turf.circle(x.properties.geometry, distance));

            if (question.data.hiderCloser) {
                mapData = safeUnion(
                    turf.featureCollection([
                        ...mapData.features,
                        holedMask(turf.featureCollection(circles)),
                    ]),
                );
            } else {
                mapData = safeUnion(
                    turf.featureCollection([...mapData.features, ...circles]),
                );
            }
        }
        if (
            question.id === "measuring" &&
            (question.data.type === "mcdonalds" ||
                question.data.type === "seven11")
        ) {
            const points = await findPlacesSpecificInZone(
                question.data.type === "mcdonalds"
                    ? QuestionSpecificLocation.McDonalds
                    : QuestionSpecificLocation.Seven11,
            );

            const seeker = turf.point([question.data.lng, question.data.lat]);
            const nearest = turf.nearestPoint(seeker, points as any);

            const distance = turf.distance(seeker, nearest, {
                units: "miles",
            });

            const filtered = points.features.filter(
                (x) =>
                    turf.distance(x as any, station.properties.geometry, {
                        units: "miles",
                    }) <
                    distance + $hidingRadius,
            );

            const circles = filtered.map((x) =>
                turf.circle(x as any, distance, {
                    units: "miles",
                }),
            );

            if (question.data.hiderCloser) {
                mapData = safeUnion(
                    turf.featureCollection([
                        ...mapData.features,
                        holedMask(turf.featureCollection(circles)),
                    ]),
                );
            } else {
                mapData = safeUnion(
                    turf.featureCollection([...mapData.features, ...circles]),
                );
            }
        }

        if (mapData.type !== "FeatureCollection") {
            mapData = {
                type: "FeatureCollection",
                features: [mapData],
            };
        }
    }

    if (_.isEqual(mapData, BLANK_GEOJSON)) {
        toast.warning(
            "The hider cannot be in this hiding zone. This wasn't eliminated on the sidebar as its absence was caused by multiple criteria.",
        );
    }

    showGeoJSON(mapData);

    if (autoZoom.get()) {
        if (animateMapMovements.get()) {
            map?.flyToBounds(bounds);
        } else {
            map?.fitBounds(bounds);
        }
    }

    const element: HTMLDivElement | null = document.querySelector(
        `[data-station-id="${station.properties.properties.id}"]`,
    );

    if (element) {
        element.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
        element.classList.add("selected-card-background-temporary");

        setTimeout(() => {
            element.classList.remove("selected-card-background-temporary");
        }, 5000);
    }
}
