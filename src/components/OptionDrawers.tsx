import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import {
    additionalMapGeoLocations,
    animateMapMovements,
    autoSave,
    autoZoom,
    defaultUnit,
    disabledStations,
    displayHidingZonesOptions,
    followMe,
    hiderMode,
    hidingRadius,
    hidingZone,
    highlightTrainLines,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    pastebinApiKey,
    planningModeEnabled,
    polyGeoJSON,
    questions,
    save,
    thunderforestApiKey,
    triggerLocalRefresh,
} from "@/lib/context";
import {
    cn,
    compress,
    decompress,
    fetchFromPastebin,
    uploadToPastebin,
} from "@/lib/utils";
import { questionsSchema } from "@/maps/schema";

import { LatitudeLongitude } from "./LatLngPicker";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "./ui/sidebar-l";
import { UnitSelect } from "./UnitSelect";

const HIDING_ZONE_URL_PARAM = "hz";
const HIDING_ZONE_COMPRESSED_URL_PARAM = "hzc";

export const OptionDrawers = ({ className }: { className?: string }) => {
    useStore(triggerLocalRefresh);
    const $defaultUnit = useStore(defaultUnit);
    const $highlightTrainLines = useStore(highlightTrainLines);
    const $animateMapMovements = useStore(animateMapMovements);
    const $autoZoom = useStore(autoZoom);
    const $hiderMode = useStore(hiderMode);
    const $hidingRadius = useStore(hidingRadius);
    const $autoSave = useStore(autoSave);
    const $hidingZone = useStore(hidingZone);
    const $planningMode = useStore(planningModeEnabled);
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const $pastebinApiKey = useStore(pastebinApiKey);
    const $followMe = useStore(followMe);
    const [isInstructionsOpen, setInstructionsOpen] = useState(false);
    const [isOptionsOpen, setOptionsOpen] = useState(false);

    useEffect(() => {
        const params = new URL(window.location.toString()).searchParams;
        const hidingZoneOld = params.get(HIDING_ZONE_URL_PARAM);
        const hidingZoneCompressed = params.get(
            HIDING_ZONE_COMPRESSED_URL_PARAM,
        );
        const pastebinId = params.get("pb");

        if (hidingZoneOld !== null) {
            // Legacy base64 encoding
            try {
                loadHidingZone(atob(hidingZoneOld));
                // Remove hiding zone parameter after initial load
                window.history.replaceState({}, "", window.location.pathname);
            } catch (e) {
                toast.error(`Invalid hiding zone settings: ${e}`);
            }
        } else if (hidingZoneCompressed !== null) {
            // Modern compressed format
            decompress(hidingZoneCompressed).then((data) => {
                try {
                    loadHidingZone(data);
                    // Remove hiding zone parameter after initial load
                    window.history.replaceState(
                        {},
                        "",
                        window.location.pathname,
                    );
                } catch (e) {
                    toast.error(`Invalid hiding zone settings: ${e}`);
                }
            });
        } else if (pastebinId !== null) {
            fetchFromPastebin(pastebinId)
                .then((data) => {
                    try {
                        loadHidingZone(data);
                        // Remove pb parameter after initial load
                        window.history.replaceState(
                            {},
                            "",
                            window.location.pathname,
                        );
                        toast.success(
                            "Successfully loaded data from Pastebin link!",
                        );
                    } catch (e) {
                        toast.error(`Invalid data from Pastebin: ${e}`);
                    }
                })
                .catch((error) => {
                    console.error("Failed to fetch from Pastebin:", error);
                    toast.error(
                        `Failed to load from Pastebin: ${error.message}`,
                    );
                });
        }
    }, []);

    const loadHidingZone = (hidingZone: string) => {
        try {
            const geojson = JSON.parse(hidingZone);

            if (
                geojson.properties &&
                geojson.properties.isHidingZone === true
            ) {
                questions.set(
                    questionsSchema.parse(geojson.properties.questions ?? []),
                );
                mapGeoLocation.set(geojson);
                mapGeoJSON.set(null);
                polyGeoJSON.set(null);

                if (geojson.alternateLocations) {
                    additionalMapGeoLocations.set(geojson.alternateLocations);
                } else {
                    additionalMapGeoLocations.set([]);
                }
            } else {
                if (geojson.questions) {
                    questions.set(questionsSchema.parse(geojson.questions));
                    delete geojson.questions;

                    mapGeoJSON.set(geojson);
                    polyGeoJSON.set(geojson);
                } else {
                    questions.set([]);
                    mapGeoJSON.set(geojson);
                    polyGeoJSON.set(geojson);
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

            if (geojson.zoneOptions) {
                displayHidingZonesOptions.set(geojson.zoneOptions ?? []);
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
                "flex justify-end gap-2 max-[412px]:!mb-4 max-[340px]:flex-col",
                className,
            )}
        >
            <Button
                className="shadow-md"
                onClick={async () => {
                    const hidingZoneString = JSON.stringify($hidingZone);
                    let compressedData;
                    try {
                        compressedData = await compress(hidingZoneString);
                    } catch (error) {
                        console.error("Compression failed:", error);
                        toast.error(`Failed to prepare data for sharing`);
                        return;
                    }

                    const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
                    let shareUrl = `${baseUrl}?${HIDING_ZONE_COMPRESSED_URL_PARAM}=${compressedData}`;

                    if (shareUrl.length > 2000) {
                        if (!$pastebinApiKey) {
                            toast.error(
                                "Data is too large for a URL. Please enter a Pastebin API key in Options to share via Pastebin.",
                            );
                            return;
                        }
                        try {
                            toast.info(
                                "Data is large, attempting to share via Pastebin...",
                            );
                            const pastebinUrl = await uploadToPastebin(
                                $pastebinApiKey,
                                hidingZoneString,
                            );
                            const pasteId = pastebinUrl.substring(
                                pastebinUrl.lastIndexOf("/") + 1,
                            );
                            shareUrl = `${baseUrl}?pb=${pasteId}`;
                            toast.success(
                                "Successfully uploaded to Pastebin! URL is ready to be shared.",
                            );
                        } catch (error) {
                            console.error("Pastebin upload failed:", error);
                            toast.error(
                                `Pastebin upload failed. Please check your API key and try again.`,
                            );
                            return;
                        }
                    }

                    // Show platform native share sheet if possible
                    if (navigator.share) {
                        navigator
                            .share({
                                title: document.title,
                                url: shareUrl,
                            })
                            .catch(() =>
                                toast.error(
                                    "Failed to share via OS. If data is very large, ensure Pastebin settings are correct.",
                                ),
                            );
                    } else if (!navigator || !navigator.clipboard) {
                        return toast.error(
                            `Clipboard not supported. Try manually copying/pasting: ${shareUrl}`,
                            { className: "p-0 w-[1000px]" },
                        );
                    } else {
                        navigator.clipboard.writeText(shareUrl);
                        toast.success("Hiding zone URL copied to clipboard", {
                            autoClose: 2000,
                        });
                    }
                }}
            >
                Share
            </Button>
            <Drawer
                open={isInstructionsOpen}
                onOpenChange={setInstructionsOpen}
            >
                <DrawerTrigger className="w-24" asChild>
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
                <DrawerTrigger className="w-24" asChild>
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
                            {$highlightTrainLines && (
                                <Separator className="bg-slate-300 w-[280px]" />
                            )}
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    Highlight train lines?
                                </label>
                                <Checkbox
                                    checked={$highlightTrainLines}
                                    onCheckedChange={() => {
                                        const willBeEnabled =
                                            !$highlightTrainLines;
                                        if (
                                            willBeEnabled &&
                                            !$thunderforestApiKey
                                        ) {
                                            toast.warn(
                                                "A Thunderforest API key is required to highlight train lines. Please add one in the options below.",
                                            );
                                        }
                                        highlightTrainLines.set(willBeEnabled);
                                    }}
                                />
                            </div>
                            {$highlightTrainLines && (
                                <>
                                    <div className="flex flex-col items-center gap-2">
                                        <Label>Thunderforest API Key</Label>
                                        <Input
                                            type="text"
                                            value={$thunderforestApiKey}
                                            onChange={(e) =>
                                                thunderforestApiKey.set(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Enter your Thunderforest API key"
                                        />
                                        <p className="text-xs text-gray-500">
                                            Needed for highlighting train lines.
                                            Create a key{" "}
                                            <a
                                                href="https://manage.thunderforest.com/users/sign_up?price=hobby-project-usd"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-500 cursor-pointer"
                                            >
                                                here.
                                            </a>{" "}
                                            Don&apos;t worry, it&apos;s free.
                                        </p>
                                    </div>
                                    <Separator className="bg-slate-300 w-[280px]" />{" "}
                                </>
                            )}
                            <Separator className="bg-slate-300 w-[280px]" />
                            <div className="flex flex-col items-center gap-2">
                                <Label>Pastebin API Key</Label>
                                <Input
                                    type="text"
                                    value={$pastebinApiKey}
                                    onChange={(e) =>
                                        pastebinApiKey.set(e.target.value)
                                    }
                                    placeholder="Enter your Pastebin API key"
                                />
                                <p className="text-xs text-gray-500">
                                    Needed for sharing large game data. Create a
                                    key{" "}
                                    <a
                                        href="https://pastebin.com/doc_api"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-500 cursor-pointer"
                                    >
                                        here
                                    </a>
                                    .
                                </p>
                            </div>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    Enable planning mode?
                                </label>
                                <Checkbox
                                    checked={$planningMode}
                                    onCheckedChange={() => {
                                        if ($planningMode === true) {
                                            const map = leafletMapContext.get();

                                            if (map) {
                                                map.eachLayer((layer: any) => {
                                                    if (
                                                        layer.questionKey ||
                                                        layer.questionKey === 0
                                                    ) {
                                                        map.removeLayer(layer);
                                                    }
                                                });
                                            }
                                        } else {
                                            questions.set([...questions.get()]); // I think that this should always be auto-saved
                                        }

                                        planningModeEnabled.set(!$planningMode);
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
                                    Auto zoom?
                                </label>
                                <Checkbox
                                    checked={$autoZoom}
                                    onCheckedChange={() =>
                                        autoZoom.set(!$autoZoom)
                                    }
                                />
                            </div>
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    Follow Me (GPS)?
                                </label>
                                <Checkbox
                                    checked={$followMe}
                                    onCheckedChange={() =>
                                        followMe.set(!$followMe)
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
                                        inlineEdit
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
                                        label="Hider Location"
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
