import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar-r";
import {
    displayHidingZones,
    leafletMapContext,
    questionFinishedMapData,
    questions,
} from "../lib/context";
import { useStore } from "@nanostores/react";
import { MENU_ITEM_CLASSNAME } from "./ui/sidebar-l";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { useEffect, useState } from "react";
import { geoJSON } from "leaflet";
import { findPlacesInZone, trainLineNodeFinder } from "@/maps/api";
import * as turf from "@turf/turf";
import osmtogeojson from "osmtogeojson";
import { unionize } from "@/maps/geo-utils";
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

let determiningHidingZones = false;

export const ZoneSidebar = () => {
    const $displayHidingZones = useStore(displayHidingZones);
    const $questionFinishedMapData = useStore(questionFinishedMapData);
    const $questions = useStore(questions);
    const map = useStore(leafletMapContext);
    const [stations, setStations] = useState<any[]>([]);

    useEffect(() => {
        if (!map || determiningHidingZones) return;

        map.eachLayer((layer: any) => {
            if (layer.hidingZones) {
                // Hopefully only geoJSON layers
                map.removeLayer(layer);
            }
        });

        const initializeHidingZones = async () => {
            determiningHidingZones = true;

            let places = osmtogeojson(
                await findPlacesInZone(
                    "[railway=station]",
                    "Finding train stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
                    "node",
                ),
            ).features;

            for (const question of $questions) {
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
                        turf.featureCollection(places) as any,
                    );

                    if (question.data.type === "same-train-line") {
                        const nodes = await trainLineNodeFinder(
                            nearestTrainStation.properties.id,
                        );

                        if (nodes.length === 0) {
                            toast.warning(
                                `No train line found for ${nearestTrainStation.properties["name:en"] || nearestTrainStation.properties.name}`,
                            );
                            continue;
                        } else {
                            places = places.filter((place: any) => {
                                const id = parseInt(
                                    place.properties.id.split("/")[1],
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

                        places = places.filter((place: any) => {
                            const name =
                                place.properties["name:en"] ||
                                place.properties.name;

                            if (!name) return false;

                            return question.data.same
                                ? name[0].toUpperCase() === letter
                                : name[0].toUpperCase() !== letter;
                        });
                    } else if (question.data.type === "same-length-station") {
                        const length = englishName.length;

                        places = places.filter((place: any) => {
                            const name =
                                place.properties["name:en"] ||
                                place.properties.name;

                            if (!name) return false;

                            return question.data.same
                                ? name.length === length
                                : name.length !== length;
                        });
                    }
                }
            }

            const unionized = unionize($questionFinishedMapData)!;

            const circles = turf.featureCollection(
                places
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
                    .filter((x) => !turf.booleanWithin(x, unionized)),
            );

            const geoJsonLayer = geoJSON(circles, {
                style: {
                    color: "green",
                    fillColor: "green",
                    fillOpacity: 0.2,
                },
            });

            // @ts-expect-error This is intentionally added as a check
            geoJsonLayer.hidingZones = true;

            geoJsonLayer.addTo(map);

            setStations(circles.features);
            determiningHidingZones = false;
        };

        if ($displayHidingZones && $questionFinishedMapData) {
            initializeHidingZones();
        }
    }, [$questionFinishedMapData, $displayHidingZones, $questions]);

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
                            {$displayHidingZones && (
                                <Command>
                                    <CommandInput placeholder="Search for a hiding zone..." />
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
                                                    onSelect={() => {
                                                        const bbox =
                                                            turf.bbox(station);

                                                        map?.fitBounds([
                                                            [bbox[1], bbox[0]],
                                                            [bbox[3], bbox[2]],
                                                        ]);
                                                    }}
                                                >
                                                    {station.properties
                                                        .properties[
                                                        "name:en"
                                                    ] ||
                                                        station.properties
                                                            .properties.name}
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
