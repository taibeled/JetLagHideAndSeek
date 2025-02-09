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
} from "../lib/context";
import { useStore } from "@nanostores/react";
import { MENU_ITEM_CLASSNAME } from "./ui/sidebar-l";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { useEffect, useState } from "react";
import { geoJSON } from "leaflet";
import { findPlacesInZone } from "@/maps/api";
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

let determiningHidingZones = false;

export const ZoneSidebar = () => {
    const $displayHidingZones = useStore(displayHidingZones);
    const $questionFinishedMapData = useStore(questionFinishedMapData);
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

            const places = osmtogeojson(
                await findPlacesInZone(
                    "[railway=station]",
                    "Finding train stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
                    "node",
                ),
            );

            const unionized = unionize($questionFinishedMapData)!;

            const circles = turf.featureCollection(
                places.features
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
    }, [$questionFinishedMapData, $displayHidingZones]);

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
                                                            .properties.osm_id
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
