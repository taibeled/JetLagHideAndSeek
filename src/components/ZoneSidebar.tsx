import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar-r";
import {
    animateMapMovements,
    disabledStations,
    displayHidingZones,
    displayHidingZonesOptions,
    hidingRadius,
    leafletMapContext,
    planningModeEnabled,
    questionFinishedMapData,
    questions,
    trainStations,
    isLoading,
} from "../lib/context";
import { useStore } from "@nanostores/react";
import { MENU_ITEM_CLASSNAME } from "./ui/sidebar-l";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import {
    findPlacesInZone,
    findPlacesSpecificInZone,
    findTentacleLocations,
    nearestToQuestion,
    QuestionSpecificLocation,
    trainLineNodeFinder,
} from "@/maps/api";
import * as turf from "@turf/turf";
import osmtogeojson from "osmtogeojson";
import { holedMask, lngLatToText, unionize } from "@/maps/geo-utils";
import { cn } from "@/lib/utils";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "./ui/command";
import { toast } from "react-toastify";
import _ from "lodash";
import { MultiSelect } from "./ui/multi-select";
import { Input } from "./ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { geoSpatialVoronoi } from "@/maps/voronoi";
import { ScrollToTop } from "./ui/scroll-to-top";

let buttonJustClicked = false;

export const ZoneSidebar = () => {
    const $displayHidingZones = useStore(displayHidingZones);
    const $questionFinishedMapData = useStore(questionFinishedMapData);
    const $displayHidingZonesOptions = useStore(displayHidingZonesOptions);
    const $hidingRadius = useStore(hidingRadius);
    const $isLoading = useStore(isLoading);
    const map = useStore(leafletMapContext);
    const stations = useStore(trainStations);
    const $disabledStations = useStore(disabledStations);
    const [commandValue, setCommandValue] = useState<string>("");
    const setStations = trainStations.set;
    const sidebarRef = useRef<HTMLDivElement>(null);

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
    ) => {
        if (!map) return;

        removeHidingZones();

        const geoJsonLayer = L.geoJSON(geoJSONData, {
            style: {
                color: "green",
                fillColor: "green",
                fillOpacity: 0.2,
            },
            onEachFeature: nonOverlappingStations
                ? (feature, layer) => {
                      layer.on("click", async () => {
                          if (!map) return;

                          setCommandValue(feature.properties.properties.id);

                          await selectionProcess(
                              feature,
                              map,
                              stations,
                              showGeoJSON,
                              $questionFinishedMapData,
                              $hidingRadius,
                          ).catch((error) => {
                              console.log(error);

                              if (
                                  document.querySelectorAll(".Toastify__toast")
                                      .length === 0
                              ) {
                                  return toast.error("An error occurred");
                              }
                          });
                      });
                  }
                : undefined,
            pointToLayer(geoJsonPoint, latlng) {
                const marker = L.marker(latlng, {
                    icon: L.divIcon({
                        html: `<div class="text-black bg-opacity-0"><svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg"><path d="M96 0C43 0 0 43 0 96L0 352c0 48 35.2 87.7 81.1 94.9l-46 46C28.1 499.9 33.1 512 43 512l39.7 0c8.5 0 16.6-3.4 22.6-9.4L160 448l128 0 54.6 54.6c6 6 14.1 9.4 22.6 9.4l39.7 0c10 0 15-12.1 7.9-19.1l-46-46c46-7.1 81.1-46.9 81.1-94.9l0-256c0-53-43-96-96-96L96 0zM64 96c0-17.7 14.3-32 32-32l256 0c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32L96 224c-17.7 0-32-14.3-32-32l0-96zM224 288a48 48 0 1 1 0 96 48 48 0 1 1 0-96z"></path></svg></div>`,
                        className: "",
                    }),
                });

                marker.bindPopup(
                    `<b>${
                        geoJsonPoint.properties["name:en"] ||
                        geoJsonPoint.properties.name ||
                        "No Name Found"
                    } (${lngLatToText(
                        geoJsonPoint.geometry.coordinates as [number, number],
                    )})</b>`,
                );

                return marker;
            },
            ...additionalOptions,
        });

        // @ts-expect-error This is intentionally added as a check
        geoJsonLayer.hidingZones = true;

        geoJsonLayer.addTo(map);
    };

    useEffect(() => {
        if (!map || isLoading.get()) return;

        const initializeHidingZones = async () => {
            isLoading.set(true);

            if ($displayHidingZonesOptions.length === 0) {
                toast.error("At least one place type must be selected");
                isLoading.set(false);
                return;
            }

            const places = osmtogeojson(
                await findPlacesInZone(
                    $displayHidingZonesOptions[0],
                    "Finding stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
                    "nwr",
                    "center",
                    $displayHidingZonesOptions.slice(1),
                ),
            ).features;

            const unionized = unionize(
                turf.simplify($questionFinishedMapData, {
                    tolerance: 0.001,
                }),
            );

            let circles = places
                .map((place: any) => {
                    const radius = $hidingRadius;
                    const center = turf.getCoord(place);
                    const circle = turf.circle(center, radius, {
                        steps: 32,
                        units: "miles", // As per the rules
                        properties: place,
                    });

                    return circle;
                })
                .filter((circle) => {
                    return !turf.booleanWithin(circle, unionized);
                });

            for (const question of questions.get()) {
                if (planningModeEnabled.get() && question.data.drag) {
                    continue;
                }

                if (
                    question.id === "matching" &&
                    (question.data.type === "same-first-letter-station" ||
                        question.data.type === "same-length-station" ||
                        question.data.type === "same-train-line")
                ) {
                    const location = turf.point([
                        question.data.lng,
                        question.data.lat,
                    ]);

                    const nearestTrainStation = turf.nearestPoint(
                        location,
                        turf.featureCollection(
                            circles.map((x) => x.properties),
                        ) as any,
                    );

                    if (question.data.type === "same-train-line") {
                        const nodes = await trainLineNodeFinder(
                            nearestTrainStation.properties.id,
                        );

                        if (nodes.length === 0) {
                            toast.warning(
                                `No train line found for ${
                                    nearestTrainStation.properties["name:en"] ||
                                    nearestTrainStation.properties.name
                                }`,
                            );
                            continue;
                        } else {
                            circles = circles.filter((circle: any) => {
                                const id = parseInt(
                                    circle.properties.properties.id.split(
                                        "/",
                                    )[1],
                                );

                                return question.data.same
                                    ? nodes.includes(id)
                                    : !nodes.includes(id);
                            });
                        }
                    }

                    const englishName =
                        nearestTrainStation.properties["name:en"] ||
                        nearestTrainStation.properties.name;

                    if (!englishName)
                        return toast.error("No English name found");

                    if (question.data.type === "same-first-letter-station") {
                        const letter = englishName[0].toUpperCase();

                        circles = circles.filter((circle: any) => {
                            const name =
                                circle.properties.properties["name:en"] ||
                                circle.properties.properties.name;

                            if (!name) return false;

                            return question.data.same
                                ? name[0].toUpperCase() === letter
                                : name[0].toUpperCase() !== letter;
                        });
                    } else if (question.data.type === "same-length-station") {
                        const length = englishName.length;

                        circles = circles.filter((circle: any) => {
                            const name =
                                circle.properties.properties["name:en"] ||
                                circle.properties.properties.name;

                            if (!name) return false;

                            return question.data.same
                                ? name.length === length
                                : name.length !== length;
                        });
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

                    const nearestPoint = turf.nearestPoint(
                        turf.point([question.data.lng, question.data.lat]),
                        points as any,
                    );

                    const distance = turf.distance(
                        turf.point([question.data.lng, question.data.lat]),
                        nearestPoint as any,
                        {
                            units: "miles",
                        },
                    );

                    circles = circles.filter((circle: any) => {
                        const point = turf.point(
                            turf.getCoord(circle.properties),
                        );

                        const nearest = turf.nearestPoint(point, points as any);

                        return question.data.hiderCloser
                            ? turf.distance(point, nearest as any, {
                                  units: "miles",
                              }) <
                                  distance + $hidingRadius
                            : turf.distance(point, nearest as any, {
                                  units: "miles",
                              }) >
                                  distance - $hidingRadius;
                    });
                }
            }

            setCommandValue("");
            showGeoJSON(
                turf.featureCollection(
                    circles.filter(
                        (x) =>
                            !$disabledStations.includes(
                                x.properties.properties.id,
                            ),
                    ),
                ),
                true,
            );

            setStations(circles);
            isLoading.set(false);
        };

        if ($displayHidingZones && $questionFinishedMapData) {
            initializeHidingZones().catch((error) => {
                console.log(error);

                if (
                    document.querySelectorAll(".Toastify__toast").length === 0
                ) {
                    isLoading.set(false);
                    return toast.error("An error occurred");
                }
            });
        }

        if (!$displayHidingZones) {
            map.eachLayer((layer: any) => {
                if (layer.hidingZones) {
                    // Hopefully only geoJSON layers
                    map.removeLayer(layer);
                }
            });
        }
    }, [
        $questionFinishedMapData,
        $displayHidingZones,
        $displayHidingZonesOptions,
        $hidingRadius,
    ]);

    return (
        <Sidebar side="right">
            <h2 className="ml-4 mt-4 font-poppins text-2xl">Hiding Zone</h2>
            <SidebarContent ref={sidebarRef}>
                <ScrollToTop element={sidebarRef} minHeight={500} />
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                                <Label className="font-semibold font-poppins">
                                    Display hiding zones?
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
                                            label: "Railway Stations Excluding Subways",
                                            value: "[railway=station][subway!=yes]",
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
                                    className="!bg-popover bg-opacity-100"
                                    disabled={$isLoading}
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
                                        defaultValue={$hidingRadius}
                                        onChange={(e) => {
                                            hidingRadius.set(
                                                parseFloat(e.target.value),
                                            );
                                        }}
                                        disabled={$isLoading}
                                    />
                                    <Select value="miles" disabled>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Unit" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="miles">
                                                Miles
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </SidebarMenuItem>
                            {$displayHidingZones && stations.length > 0 && (
                                <SidebarMenuItem
                                    className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                    onClick={removeHidingZones}
                                    disabled={$isLoading}
                                >
                                    No Display
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && stations.length > 0 && (
                                <SidebarMenuItem
                                    className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                    onClick={() => {
                                        setCommandValue("");
                                        showGeoJSON(
                                            turf.featureCollection(
                                                stations
                                                    .filter(
                                                        (x) =>
                                                            x.properties
                                                                .properties
                                                                .id !==
                                                            commandValue,
                                                    )
                                                    .map((x) => x.properties),
                                            ),
                                            false,
                                        );
                                    }}
                                    disabled={$isLoading}
                                >
                                    All Stations
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && stations.length > 0 && (
                                <SidebarMenuItem
                                    className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                    onClick={() => {
                                        setCommandValue("");
                                        showGeoJSON(
                                            turf.featureCollection(
                                                stations.filter(
                                                    (x) =>
                                                        !$disabledStations.includes(
                                                            x.properties
                                                                .properties.id,
                                                        ),
                                                ),
                                            ),
                                            true,
                                        );
                                    }}
                                    disabled={$isLoading}
                                >
                                    All Zones
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && stations.length > 0 && (
                                <SidebarMenuItem
                                    className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                    onClick={() => {
                                        setCommandValue("");
                                        showGeoJSON(
                                            unionize(
                                                turf.featureCollection(
                                                    stations.filter(
                                                        (x) =>
                                                            !$disabledStations.includes(
                                                                x.properties
                                                                    .properties
                                                                    .id,
                                                            ),
                                                    ),
                                                ),
                                            ),
                                        );
                                    }}
                                    disabled={$isLoading}
                                >
                                    No Overlap
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones && commandValue && (
                                <SidebarMenuItem
                                    className={cn(
                                        MENU_ITEM_CLASSNAME,
                                        "bg-popover hover:bg-accent",
                                    )}
                                    disabled={$isLoading}
                                >
                                    Current:{" "}
                                    <a
                                        href={`https://www.openstreetmap.org/${
                                            stations.find(
                                                (x) =>
                                                    x.properties.properties
                                                        .id === commandValue,
                                            ).properties.properties.id
                                        }`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-500"
                                    >
                                        {stations.find(
                                            (x) =>
                                                x.properties.properties.id ===
                                                commandValue,
                                        ).properties.properties["name:en"] ||
                                            stations.find(
                                                (x) =>
                                                    x.properties.properties
                                                        .id === commandValue,
                                            ).properties.properties.name ||
                                            lngLatToText(
                                                stations.find(
                                                    (x) =>
                                                        x.properties.properties
                                                            .id ===
                                                        commandValue,
                                                ).properties.geometry
                                                    .coordinates,
                                            )}
                                    </a>
                                </SidebarMenuItem>
                            )}
                            {$displayHidingZones &&
                                $disabledStations.length > 0 && (
                                    <SidebarMenuItem
                                        className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                                        onClick={() => {
                                            disabledStations.set([]);

                                            showGeoJSON(
                                                turf.featureCollection(
                                                    stations,
                                                ),
                                                true,
                                            );
                                        }}
                                        disabled={$isLoading}
                                    >
                                        Clear Disabled
                                    </SidebarMenuItem>
                                )}
                            {$displayHidingZones && (
                                <Command>
                                    <CommandInput
                                        placeholder="Search for a hiding zone..."
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
                                                                buttonJustClicked =
                                                                    false;
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

                                                            showGeoJSON(
                                                                turf.featureCollection(
                                                                    stations.filter(
                                                                        (x) =>
                                                                            !disabledStations
                                                                                .get()
                                                                                .includes(
                                                                                    x
                                                                                        .properties
                                                                                        .properties
                                                                                        .id,
                                                                                ),
                                                                    ),
                                                                ),
                                                                true,
                                                            );
                                                        }, 100);
                                                    }}
                                                    disabled={$isLoading}
                                                >
                                                    {station.properties
                                                        .properties[
                                                        "name:en"
                                                    ] ||
                                                        station.properties
                                                            .properties.name ||
                                                        lngLatToText(
                                                            station.properties
                                                                .geometry
                                                                .coordinates,
                                                        )}
                                                    <button
                                                        onClick={async () => {
                                                            if (!map) return;

                                                            buttonJustClicked =
                                                                true;

                                                            setCommandValue(
                                                                station
                                                                    .properties
                                                                    .properties
                                                                    .id,
                                                            );

                                                            await selectionProcess(
                                                                station,
                                                                map,
                                                                stations,
                                                                showGeoJSON,
                                                                $questionFinishedMapData,
                                                                $hidingRadius,
                                                            ).catch((error) => {
                                                                console.log(
                                                                    error,
                                                                );

                                                                if (
                                                                    document.querySelectorAll(
                                                                        ".Toastify__toast",
                                                                    ).length ===
                                                                    0
                                                                ) {
                                                                    return toast.error(
                                                                        "An error occurred",
                                                                    );
                                                                }
                                                            });
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

const BLANK_GEOJSON = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: {},
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [-180, -90],
                        [180, -90],
                        [180, 90],
                        [-180, 90],
                        [-180, -90],
                    ],
                ],
            },
        },
    ],
};

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
        unionize(
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
            (question.id === "measuring" || question.id === "matching") &&
            (question.data.type === "aquarium" ||
                question.data.type === "zoo" ||
                question.data.type === "theme_park" ||
                question.data.type === "museum" ||
                question.data.type === "hospital" ||
                question.data.type === "cinema" ||
                question.data.type === "library" ||
                question.data.type === "golf_course" ||
                question.data.type === "consulate" ||
                question.data.type === "park")
        ) {
            const nearestQuestion = await nearestToQuestion(question.data);

            let radius = 30;

            let instances: any = { features: [] };

            const nearestPoints = [];

            while (instances.features.length === 0) {
                instances = await findTentacleLocations(
                    {
                        lat: station.properties.geometry.coordinates[1],
                        lng: station.properties.geometry.coordinates[0],
                        radius: radius,
                        unit: "miles",
                        location: false,
                        locationType: question.data.type,
                        drag: false,
                        color: "black",
                    },
                    "Finding matching locations to hiding zone...",
                );

                const distances: any[] = instances.features.map((x: any) => {
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

                if (distances.length === 0) {
                    radius += 30;
                    continue;
                }

                const minimumPoint = _.minBy(distances, "distance")!;

                if (minimumPoint.distance + $hidingRadius * 2 > radius) {
                    radius = minimumPoint.distance + $hidingRadius * 2;
                    continue;
                }

                nearestPoints.push(
                    ...distances
                        .filter(
                            (x) =>
                                x.distance <
                                    minimumPoint.distance + $hidingRadius * 2 &&
                                x.point.properties.name, // If it doesn't have a name, it's not a valid location
                        )
                        .map((x) => x.point),
                );
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
                    mapData = unionize(
                        turf.featureCollection([
                            ...mapData.features,
                            turf.mask(correctPolygon),
                        ]),
                    );
                } else {
                    mapData = unionize(
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
                    mapData = unionize(
                        turf.featureCollection([
                            ...mapData.features,
                            holedMask(turf.featureCollection(circles)),
                        ]),
                    );
                } else {
                    mapData = unionize(
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
                mapData = unionize(
                    turf.featureCollection([
                        ...mapData.features,
                        holedMask(turf.featureCollection(circles)),
                    ]),
                );
            } else {
                mapData = unionize(
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
                mapData = unionize(
                    turf.featureCollection([
                        ...mapData.features,
                        holedMask(turf.featureCollection(circles)),
                    ]),
                );
            } else {
                mapData = unionize(
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

    if (animateMapMovements.get()) {
        map?.flyToBounds(bounds);
    } else {
        map?.fitBounds(bounds);
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
