import {
    animateMapMovements,
    autoSave,
    defaultUnit,
    hiderMode,
    hidingRadius,
    highlightTrainLines,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    questions,
    disabledStations,
    save,
    triggerLocalRefresh,
    hidingZone,
} from "@/lib/context";
import { useEffect } from "react";
import { Button } from "./ui/button";
import { toast } from "react-toastify";
import { Label } from "./ui/label";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { Separator } from "./ui/separator";
import { useStore } from "@nanostores/react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Checkbox } from "./ui/checkbox";
import { LatitudeLongitude } from "./LatLngPicker";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "./ui/sidebar-l";
import { questionsSchema } from "@/lib/schema";
import { UnitSelect } from "./UnitSelect";

const hidingZoneUrlParam = "hz";

export const OptionDrawers = ({ className }: { className?: string }) => {
    useStore(triggerLocalRefresh);
    const $defaultUnit = useStore(defaultUnit);
    const $highlightTrainLines = useStore(highlightTrainLines);
    const $animateMapMovements = useStore(animateMapMovements);
    const $hiderMode = useStore(hiderMode);
    const $hidingRadius = useStore(hidingRadius);
    const $autoSave = useStore(autoSave);
    const [isInstructionsOpen, setInstructionsOpen] = useState(false);
    const [isOptionsOpen, setOptionsOpen] = useState(false);

    const $hidingZone = useStore(hidingZone);

    hidingZone.listen((s) => {
        const _params = new URL(window.location.toString()).searchParams;
        const _current = _params.get(hidingZoneUrlParam);

        const b64 = btoa(JSON.stringify(s));

        if (_current === b64) {
            return;
        }

        const params = new URLSearchParams({ [hidingZoneUrlParam]: b64 });
        window.history.pushState(
            {},
            "",
            `${window.location.pathname}?${params.toString()}`,
        );
    });

    // Listen for history state changes to enable use of back-button to undo changes to zone
    useEffect(() => {
        const handler = () => {
            const params = new URL(window.location.toString()).searchParams;
            const hidingZone = params.get(hidingZoneUrlParam);
            if (hidingZone !== null) {
                try {
                    loadHidingZone(atob(hidingZone));
                } catch (e) {
                    toast.error(`Invalid hiding zone settings: ${e}`);
                }
            }
        };
        // Load on init
        handler();

        window.addEventListener("popstate", handler);
        return () => {
            window.removeEventListener("popstate", handler);
        };
    }, []);

    const loadHidingZone = (hidingZone) => {
        try {
            const geojson = JSON.parse(hidingZone);

            if (
                geojson.properties &&
                geojson.properties.isHidingZone === true
            ) {
                mapGeoLocation.set(geojson);
                mapGeoJSON.set(null);
                polyGeoJSON.set(null);
                questions.set(
                    questionsSchema.parse(geojson.properties.questions ?? []),
                );
            } else {
                if (geojson.questions) {
                    questions.set(questionsSchema.parse(geojson.questions));
                    delete geojson.questions;

                    mapGeoJSON.set(geojson);
                    polyGeoJSON.set(geojson);
                } else {
                    mapGeoJSON.set(geojson);
                    polyGeoJSON.set(geojson);
                    questions.set([]);
                }
            }

            if (
                geojson.disabledStations !== null &&
                geojson.disabledStations.constructor === Array
            ) {
                disabledStations.set(geojson.disabledStations);
            }

            if (geojson.hidingRadius !== null) {
                hidingRadius.set(geojson.hidingRadius);
            }

            toast.success("Hiding zone loaded successfully", {
                autoClose: 2000,
            });
        } catch (e) {
            toast.error(`Invalid hiding zone settings: ${e}`);
        }
    };

    return (
        <div
            className={cn(
                "flex justify-end gap-2 max-[412px]:!mb-4",
                className,
            )}
        >
            <Drawer
                open={isInstructionsOpen}
                onOpenChange={setInstructionsOpen}
            >
                <DrawerTrigger className="w-24">
                    <Button className="w-24 shadow-md">Instructions</Button>
                </DrawerTrigger>
                <DrawerContent>
                    <div className="flex flex-col items-center gap-4 mb-1">
                        <DrawerHeader>
                            <DrawerTitle className="text-4xl font-semibold font-poppins">
                                Instructions
                            </DrawerTitle>
                        </DrawerHeader>
                        <div className="px-12 pb-2 max-w-[1000px] text-center overflow-y-scroll max-h-[40vh] font-oxygen">
                            <DrawerDescription className="mb-2">
                                Map Generator for Jet Lag The Game: Hide and
                                Seek is intended for those who have purchased
                                the Jet Lag Home Game. However, it is not
                                affiliated with them in any way.
                            </DrawerDescription>
                            <p className="mb-3">
                                At the beginning of the game, all players should
                                coordinate the bounds of the game (Japan for the
                                original Hide and Seek). You can choose a
                                location at the top of the map (e.g. city,
                                county, state, country...) or draw it on the map
                                (look at the bottom left of the map). This can
                                be easily shared through the{" "}
                                <a
                                    onClick={() => {
                                        setOptionsOpen(true);
                                        setInstructionsOpen(false);
                                    }}
                                    className="text-blue-500 cursor-pointer"
                                >
                                    options menu
                                </a>{" "}
                                at the bottom right of the screen. You may want
                                to change the default unit from miles in that
                                menu. You can also choose to highlight train
                                lines on the map in that menu.
                            </p>
                            <p className="mb-3">
                                Hiders should enable &ldquo;Hider Mode&rdquo; in
                                that menu. This will allow the hider to set
                                their location and have all questions be
                                automatically answered according to that
                                location. Not only will this make filling the
                                maps for hiders incredibly easy, but it will
                                also prevent any conflicting information between
                                the hider and the seekers.
                            </p>
                            <p className="mb-3">
                                Whenever a question is asked, you should add it
                                to the map immediately. This can be done most
                                trivially by right clicking on the map in
                                desktop or long pressing on the map in mobile.
                                Choose the question from the dropdown and a
                                marker will appear where you clicked. Move that
                                to the location where you asked the question.
                                Alternatively you could click the marker and
                                click the &ldquo;Current&rdquo; button for the
                                marker to be moved to your physical location.
                                You can also add a question through the question
                                sidebar (left side of the screen, open it on the
                                top left). The sidebar will display all the
                                questions in an organized manner instead of
                                requiring a click on each marker to see each
                                question.
                            </p>
                            <p className="mb-3">
                                Seekers can also enable hiding zone mode by
                                clicking the thumbtack on the top-right of the
                                map. This will display all possible hiding zones
                                (circles with a {$hidingRadius} mile radius
                                around a train station) that the hider could be
                                in on the map in green. Hiding zone mode must be
                                enabled for questions that deal with hiding
                                zones (i.e., station starts with same letter).
                                All hiding zones will also be listed in the
                                &ldquo;Hiding Zone&rdquo; sidebar, accessible
                                from the top-right of the map.
                            </p>
                            <p className="mb-3">
                                If you encounter any bugs or have any feature
                                requests, please report them at the{" "}
                                <a
                                    href="https://github.com/taibeled/JetLagHideAndSeek/issues"
                                    className="text-blue-500 cursor-pointer"
                                >
                                    GitHub repository
                                </a>
                                . If you appreciate this project, you can also
                                leave a star there.
                            </p>
                        </div>
                    </div>
                </DrawerContent>
            </Drawer>
            <Drawer open={isOptionsOpen} onOpenChange={setOptionsOpen}>
                <DrawerTrigger className="w-24">
                    <Button className="w-24 shadow-md">Options</Button>
                </DrawerTrigger>
                <DrawerContent>
                    <div className="flex flex-col items-center gap-4 mb-4">
                        <DrawerHeader>
                            <DrawerTitle className="text-4xl font-semibold font-poppins">
                                Options
                            </DrawerTitle>
                        </DrawerHeader>
                        <div className="overflow-y-scroll max-h-[40vh] flex flex-col items-center gap-4 max-w-[1000px] px-12">
                            <div className="flex flex-row max-[330px]:flex-col gap-4">
                                <Button
                                    onClick={() => {
                                        if (!navigator || !navigator.clipboard)
                                            return toast.error(
                                                "Clipboard not supported",
                                            );
                                        navigator.clipboard.writeText(
                                            JSON.stringify($hidingZone),
                                        );
                                        toast.success(
                                            "Hiding zone copied successfully",
                                            {
                                                autoClose: 2000,
                                            },
                                        );
                                    }}
                                >
                                    Copy Hiding Zone
                                </Button>
                                <Button
                                    onClick={() => {
                                        if (!navigator || !navigator.clipboard)
                                            return toast.error(
                                                "Clipboard not supported",
                                            );
                                        navigator.clipboard
                                            .readText()
                                            .then(loadHidingZone);
                                    }}
                                >
                                    Paste Hiding Zone
                                </Button>
                            </div>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>Default Unit</Label>
                            <UnitSelect
                                unit={$defaultUnit}
                                onChange={defaultUnit.set}
                            />
                            <Separator className="bg-slate-300 w-[280px]" />
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    Animate map movements?
                                </label>
                                <Checkbox
                                    checked={$animateMapMovements}
                                    onCheckedChange={() => {
                                        animateMapMovements.set(
                                            !$animateMapMovements,
                                        );
                                    }}
                                />
                            </div>
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    Highlight train lines?
                                </label>
                                <Checkbox
                                    checked={$highlightTrainLines}
                                    onCheckedChange={() => {
                                        highlightTrainLines.set(
                                            !$highlightTrainLines,
                                        );
                                    }}
                                />
                            </div>
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    Auto save?
                                </label>
                                <Checkbox
                                    checked={$autoSave}
                                    onCheckedChange={() =>
                                        autoSave.set(!$autoSave)
                                    }
                                />
                            </div>
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    Hider mode?
                                </label>
                                <Checkbox
                                    checked={!!$hiderMode}
                                    onCheckedChange={() => {
                                        if ($hiderMode === false) {
                                            const $leafletMapContext =
                                                leafletMapContext.get();

                                            if ($leafletMapContext) {
                                                const center =
                                                    $leafletMapContext.getCenter();
                                                hiderMode.set({
                                                    latitude: center.lat,
                                                    longitude: center.lng,
                                                });
                                            } else {
                                                hiderMode.set({
                                                    latitude: 0,
                                                    longitude: 0,
                                                });
                                            }
                                        } else {
                                            hiderMode.set(false);
                                        }
                                    }}
                                />
                            </div>
                            {$hiderMode !== false && (
                                <SidebarMenu>
                                    <LatitudeLongitude
                                        latitude={$hiderMode.latitude}
                                        longitude={$hiderMode.longitude}
                                        onChange={(latitude, longitude) => {
                                            $hiderMode.latitude =
                                                latitude ?? $hiderMode.latitude;
                                            $hiderMode.longitude =
                                                longitude ??
                                                $hiderMode.longitude;

                                            if ($autoSave) {
                                                hiderMode.set({
                                                    ...$hiderMode,
                                                });
                                            } else {
                                                triggerLocalRefresh.set(
                                                    Math.random(),
                                                );
                                            }
                                        }}
                                        latLabel="Hider Latitude"
                                        lngLabel="Hider Longitude"
                                    />
                                    {!autoSave && (
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500 mt-2"
                                                onClick={save}
                                            >
                                                Save
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )}
                                </SidebarMenu>
                            )}
                        </div>
                    </div>
                </DrawerContent>
            </Drawer>
        </div>
    );
};
