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
    displayHidingZones,
    displayHidingZonesOptions,
    leafletMapContext,
    questionFinishedMapData,
    questions,
    trainStations,
} from "../lib/context";
import { useStore } from "@nanostores/react";
import { MENU_ITEM_CLASSNAME } from "./ui/sidebar-l";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { useEffect } from "react";
import { geoJSON, type Map } from "leaflet";
import {
    findPlacesInZone,
    findPlacesSpecificInZone,
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

let determiningHidingZones = false;

export const ZoneSidebar = () => {
    const $displayHidingZones = useStore(displayHidingZones);
    const $questionFinishedMapData = useStore(questionFinishedMapData);
    const $displayHidingZonesOptions = useStore(displayHidingZonesOptions);
    const map = useStore(leafletMapContext);
    const stations = useStore(trainStations);
    const setStations = trainStations.set;

    const showGeoJSON = (geoJSONData: any) => {
        if (!map) return;

        map.eachLayer((layer: any) => {
            if (layer.hidingZones) {
                // Hopefully only geoJSON layers
                map.removeLayer(layer);
            }
        });

        const geoJsonLayer = geoJSON(geoJSONData, {
            style: {
                color: "green",
                fillColor: "green",
                fillOpacity: 0.2,
            },
        });

        // @ts-expect-error This is intentionally added as a check
        geoJsonLayer.hidingZones = true;

        geoJsonLayer.addTo(map);
    };

    useEffect(() => {
        if (!map || determiningHidingZones) return;

        const initializeHidingZones = async () => {
            determiningHidingZones = true;

            if ($displayHidingZonesOptions.length === 0) {
                toast.error("No places allowed");
                determiningHidingZones = false;
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

            const unionized = unionize($questionFinishedMapData);

            let circles = places
                .map((place: any) => {
                    const radius = 0.5;
                    const center = turf.getCoord(place);
                    const circle = turf.circle(center, radius, {
                        steps: 32,
                        units: "miles", // As per the rules
                        properties: place,
                    });

                    return circle;
                })
                .filter((circle) => {
                    return !turf.booleanWithin(circle, unionized!);
                });

            for (const question of questions.get()) {
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
                                  distance + 0.5
                            : turf.distance(point, nearest as any, {
                                  units: "miles",
                              }) >
                                  distance - 0.5;
                    });
                }
            }

            showGeoJSON(turf.featureCollection(circles));

            setStations(circles);
            determiningHidingZones = false;
        };

        if ($displayHidingZones && $questionFinishedMapData) {
            initializeHidingZones().catch((error) => {
                console.log(error);

                if (
                    document.querySelectorAll(".Toastify__toast").length === 0
                ) {
                    determiningHidingZones = false;
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
    ]);

    return (
        <Sidebar side="right">
            <h2 className="ml-4 mt-4 font-poppins text-2xl">Hiding Zone</h2>
            <SidebarContent>
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
                                            label: "Bus Stops",
                                            value: "[highway=bus_stop]",
                                        },
                                    ]}
                                    onValueChange={
                                        displayHidingZonesOptions.set
                                    }
                                    defaultValue={$displayHidingZonesOptions}
                                    placeholder="Select allowed places"
                                    animation={2}
                                    maxCount={3}
                                    className="!bg-popover bg-opacity-100"
                                />
                            </SidebarMenuItem>
                            {$displayHidingZones && (
                                <Command>
                                    <CommandInput placeholder="Search for a hiding zone..." />
                                    <CommandList className="max-h-full">
                                        <CommandEmpty>
                                            No hiding zones found.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {stations.length > 0 && (
                                                <CommandItem
                                                    onSelect={() => {
                                                        const bbox = turf.bbox(
                                                            turf.featureCollection(
                                                                stations,
                                                            ),
                                                        );

                                                        const bounds: [
                                                            [number, number],
                                                            [number, number],
                                                        ] = [
                                                            [bbox[1], bbox[0]],
                                                            [bbox[3], bbox[2]],
                                                        ];

                                                        showGeoJSON(
                                                            turf.featureCollection(
                                                                stations,
                                                            ),
                                                        );

                                                        if (
                                                            animateMapMovements.get()
                                                        ) {
                                                            map?.flyToBounds(
                                                                bounds,
                                                            );
                                                        } else {
                                                            map?.fitBounds(
                                                                bounds,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    All Stations
                                                </CommandItem>
                                            )}
                                            {stations.map((station) => (
                                                <CommandItem
                                                    key={
                                                        station.properties
                                                            .properties.id
                                                    }
                                                    onSelect={async () => {
                                                        if (!map) return;

                                                        await selectionProcess(
                                                            station,
                                                            map,
                                                            stations,
                                                            showGeoJSON,
                                                            $questionFinishedMapData,
                                                        ).catch((error) => {
                                                            console.log(error);

                                                            if (
                                                                document.querySelectorAll(
                                                                    ".Toastify__toast",
                                                                ).length === 0
                                                            ) {
                                                                return toast.error(
                                                                    "An error occurred",
                                                                );
                                                            }
                                                        });
                                                    }}
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
async function selectionProcess(
    station: any,
    map: Map,
    stations: any[],
    showGeoJSON: (geoJSONData: any) => void,
    $questionFinishedMapData: any,
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
        )!,
    ]);

    for (const question of questions.get()) {
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
                        distance + 1.61 / 2,
                )
                .map((x) => turf.circle(x.properties.geometry, distance));

            if (question.data.hiderCloser) {
                mapData = unionize(
                    turf.featureCollection([
                        ...mapData.features,
                        holedMask(turf.featureCollection(circles)),
                    ]),
                )!;
            } else {
                mapData = unionize(
                    turf.featureCollection([...mapData.features, ...circles]),
                )!;
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
                    distance + 0.5,
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
                )!;
            } else {
                mapData = unionize(
                    turf.featureCollection([...mapData.features, ...circles]),
                )!;
            }
        }

        if (mapData.type !== "FeatureCollection") {
            mapData = {
                type: "FeatureCollection",
                features: [mapData],
            };
        }
    }

    if (
        _.isEqual(mapData, {
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
        })
    ) {
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
}
