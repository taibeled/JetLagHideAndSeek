import { useStore } from "@nanostores/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import {
    additionalMapGeoLocations,
    alwaysUsePastebin,
    animateMapMovements,
    autoSave,
    autoZoom,
    customInitPreference,
    customPresets,
    customStations,
    defaultUnit,
    disabledStations,
    displayHidingZonesOptions,
    followMe,
    hiderMode,
    hidingRadius,
    hidingRadiusUnits,
    hidingZone,
    highlightTrainLines,
    includeDefaultStations,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    pastebinApiKey,
    planningModeEnabled,
    polyGeoJSON,
    questions,
    save,
    showTutorial,
    thunderforestApiKey,
    triggerLocalRefresh,
    useCustomStations,
} from "@/lib/context";
import {
    cn,
    compress,
    decompress,
    fetchFromPastebin,
    shareOrFallback,
    uploadToPastebin,
} from "@/lib/utils";
import { questionsSchema } from "@/maps/schema";
import { locale, t, useT, type Locale } from "@/i18n";

import { Settings } from "lucide-react";

import { LatitudeLongitude } from "./LatLngPicker";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { Separator } from "./ui/separator";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "./ui/sidebar-l";
import { UnitSelect } from "./UnitSelect";

const HIDING_ZONE_URL_PARAM = "hz";
const HIDING_ZONE_COMPRESSED_URL_PARAM = "hzc";
const PASTEBIN_URL_PARAM = "pb";

interface OptionDrawersProps {
    className?: string;
    /** Controlled open state — if provided, the component becomes controlled */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Set to false to hide the built-in trigger button (use when trigger is external) */
    showTrigger?: boolean;
}

export const OptionDrawers = ({
    className,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    showTrigger = true,
}: OptionDrawersProps) => {
    useStore(triggerLocalRefresh);
    const tr = useT();
    const $defaultUnit = useStore(defaultUnit);
    const $highlightTrainLines = useStore(highlightTrainLines);
    const $animateMapMovements = useStore(animateMapMovements);
    const $autoZoom = useStore(autoZoom);
    const $hiderMode = useStore(hiderMode);
    const $autoSave = useStore(autoSave);
    const $hidingZone = useStore(hidingZone);
    const $planningMode = useStore(planningModeEnabled);
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const $pastebinApiKey = useStore(pastebinApiKey);
    const $alwaysUsePastebin = useStore(alwaysUsePastebin);
    const $followMe = useStore(followMe);
    const $customInitPref = useStore(customInitPreference);
    const lastDefaultUnit = useRef($defaultUnit);
    const hasSyncedInitialUnit = useRef(false);
    const [internalOpen, setInternalOpen] = useState(false);
    const [hasOpenSelect, setHasOpenSelect] = useState(false);

    // Support both controlled and uncontrolled modes
    const isOptionsOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOptionsOpen = controlledOnOpenChange !== undefined
        ? controlledOnOpenChange
        : setInternalOpen;

    useEffect(() => {
        const currentDefault = $defaultUnit;

        if (!hasSyncedInitialUnit.current) {
            hasSyncedInitialUnit.current = true;
            if (hidingRadiusUnits.get() !== currentDefault) {
                hidingRadiusUnits.set(currentDefault);
            }
        } else if (lastDefaultUnit.current !== currentDefault) {
            hidingRadiusUnits.set(currentDefault);
        }

        lastDefaultUnit.current = currentDefault;
    }, [$defaultUnit]);

    useEffect(() => {
        const params = new URL(window.location.toString()).searchParams;
        const hidingZoneOld = params.get(HIDING_ZONE_URL_PARAM);
        const hidingZoneCompressed = params.get(
            HIDING_ZONE_COMPRESSED_URL_PARAM,
        );
        const pastebinId = params.get(PASTEBIN_URL_PARAM);

        if (hidingZoneOld !== null) {
            // Legacy base64 encoding
            try {
                loadHidingZone(atob(hidingZoneOld));
                // Remove hiding zone parameter after initial load
                window.history.replaceState({}, "", window.location.pathname);
            } catch (e) {
                toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
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
                    toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
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
                        toast.success(t("toast.options.hidingZoneLoaded", locale.get()));
                    } catch (e) {
                        toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
                    }
                })
                .catch((error) => {
                    console.error("Failed to fetch from Pastebin:", error);
                    toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
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

            const incomingPresets =
                geojson.presets ?? geojson.properties?.presets;
            if (incomingPresets && Array.isArray(incomingPresets)) {
                try {
                    const normalized = (incomingPresets as any[])
                        .filter((p) => p && p.data)
                        .map((p) => {
                            return {
                                id:
                                    p.id ??
                                    (typeof crypto !== "undefined" &&
                                    typeof (crypto as any).randomUUID ===
                                        "function"
                                        ? (crypto as any).randomUUID()
                                        : String(Date.now()) + Math.random()),
                                name: p.name ?? "Imported preset",
                                type: p.type ?? "custom",
                                data: p.data,
                                createdAt:
                                    p.createdAt ?? new Date().toISOString(),
                            };
                        });
                    if (normalized.length > 0) {
                        customPresets.set(normalized);
                        toast.info(t("toast.options.importedPresets", locale.get()));
                    }
                } catch (err) {
                    console.warn("Failed to import presets", err);
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

            if (typeof geojson.useCustomStations === "boolean") {
                useCustomStations.set(geojson.useCustomStations);
            }

            if (
                geojson.customStations &&
                geojson.customStations.constructor === Array
            ) {
                customStations.set(geojson.customStations);
            }

            if (typeof geojson.includeDefaultStations === "boolean") {
                includeDefaultStations.set(geojson.includeDefaultStations);
            }

            toast.success(t("toast.options.hidingZoneLoaded", locale.get()), {
                autoClose: 2000,
            });
        } catch (e) {
            toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
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
                className="shadow-md hidden"
                onClick={async () => {
                    const hidingZoneString = JSON.stringify($hidingZone);
                    let compressedData;
                    try {
                        compressedData = await compress(hidingZoneString);
                    } catch (error) {
                        console.error("Compression failed:", error);
                        toast.error(t("toast.options.failedToPrepareData", locale.get()));
                        return;
                    }

                    const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
                    let shareUrl = `${baseUrl}?${HIDING_ZONE_COMPRESSED_URL_PARAM}=${compressedData}`;

                    if ($alwaysUsePastebin || shareUrl.length > 2000) {
                        if (!$pastebinApiKey) {
                            toast.error(
                                t("toast.options.shareDataTooLarge", locale.get()),
                            );
                            return;
                        }
                        try {
                            toast.info(t("toast.options.sharingViaPastebin", locale.get()));
                            const pastebinUrl = await uploadToPastebin(
                                $pastebinApiKey,
                                hidingZoneString,
                            );
                            const pasteId = pastebinUrl.substring(
                                pastebinUrl.lastIndexOf("/") + 1,
                            );
                            shareUrl = `${baseUrl}?${PASTEBIN_URL_PARAM}=${pasteId}`;
                            toast.success(
                                t("toast.options.pastebinSuccess", locale.get()),
                            );
                        } catch (error) {
                            console.error("Pastebin upload failed:", error);
                            toast.error(
                                t("toast.options.pastebinFailed", locale.get()),
                            );
                            return;
                        }
                    }

                    // Show platform native share sheet if possible
                    await shareOrFallback(shareUrl).then((result) => {
                        console.log(`result ${result}`);
                        if (result === false) {
                            return toast.error(
                                t("toast.options.clipboardNotSupported", locale.get()),
                                { className: "p-0 w-[1000px]" },
                            );
                        }

                        if (result === "clipboard") {
                            toast.success(
                                t("toast.options.hidingZoneUrlCopied", locale.get()),
                                {
                                    autoClose: 2000,
                                },
                            );
                        }
                    });
                }}
                data-tutorial-id="share-questions-button"
            >
                {tr("options.share")}
            </Button>
            {/* <Button
                className="w-24 shadow-md"
                onClick={() => {
                    showTutorial.set(true);
                }}
            >
                {tr("options.tutorial")}
            </Button> */}
            <Drawer open={isOptionsOpen} onOpenChange={setOptionsOpen}>
                {showTrigger && (
                    <DrawerTrigger asChild>
                        <Button
                            className="shadow-md w-10 h-10 p-0"
                            data-tutorial-id="option-questions-button"
                            aria-label={tr("options.title")}
                        >
                            <Settings className="h-5 w-5" />
                        </Button>
                    </DrawerTrigger>
                )}
                <DrawerContent onPointerDownOutside={(e) => { if (hasOpenSelect) e.preventDefault(); }}>
                    <div className="flex flex-col items-center gap-4 mb-4">
                        <DrawerHeader>
                            <DrawerTitle className="text-4xl font-semibold font-poppins">
                                {tr("options.title")}
                            </DrawerTitle>
                        </DrawerHeader>
                        <div className="overflow-y-scroll max-h-[40vh] flex flex-col items-center gap-4 max-w-[1000px] px-12">
                            {/* ── Language switcher (first item) ── */}
                            <div className="flex flex-row items-center gap-2">
                                <Label className="text-base font-semibold font-poppins">
                                    {tr("language.label")}
                                </Label>
                                <div className="flex gap-1">
                                    <Button
                                        size="sm"
                                        variant={locale.get() === "de" ? "default" : "outline"}
                                        onClick={() => locale.set("de")}
                                    >
                                        {tr("language.de")}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={locale.get() === "en" ? "default" : "outline"}
                                        onClick={() => locale.set("en")}
                                    >
                                        {tr("language.en")}
                                    </Button>
                                </div>
                            </div>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <div className="flex flex-row max-[330px]:flex-col gap-4">
                                <Button
                                    onClick={() => {
                                        if (!navigator || !navigator.clipboard)
                                            return toast.error(
                                                t("toast.options.clipboardNotSupported", locale.get()),
                                            );
                                        navigator.clipboard.writeText(
                                            JSON.stringify($hidingZone),
                                        );
                                        toast.success(
                                            t("toast.options.hidingZoneCopied", locale.get()),
                                            {
                                                autoClose: 2000,
                                            },
                                        );
                                    }}
                                >
                                    {tr("options.copyHidingZone")}
                                </Button>
                                <Button
                                    onClick={() => {
                                        if (!navigator || !navigator.clipboard)
                                            return toast.error(
                                                t("toast.options.clipboardNotSupported", locale.get()),
                                            );
                                        navigator.clipboard
                                            .readText()
                                            .then(loadHidingZone);
                                    }}
                                >
                                    {tr("options.pasteHidingZone")}
                                </Button>
                            </div>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>{tr("options.defaultUnit")}</Label>
                            <UnitSelect
                                unit={$defaultUnit}
                                onChange={defaultUnit.set}
                                onOpenChange={setHasOpenSelect}
                            />
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>{tr("options.newCustomQuestionDefaults")}</Label>
                            <Select
                                trigger={tr("options.newCustomQuestionDefaults")}
                                options={{
                                    ask: tr("selectOption.askEachTime"),
                                    blank: tr("selectOption.startBlank"),
                                    prefill: tr("selectOption.copyFromCurrent"),
                                }}
                                value={$customInitPref}
                                onValueChange={(v) =>
                                    customInitPreference.set(v as any)
                                }
                                onOpenChange={setHasOpenSelect}
                            />
                            <Separator className="bg-slate-300 w-[280px]" />
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    {tr("options.animateMapMovements")}
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
                                    {tr("options.highlightTrainLines")}
                                </label>
                                <Checkbox
                                    checked={$highlightTrainLines}
                                    onCheckedChange={() => {
                                        const willBeEnabled =
                                            !$highlightTrainLines;
                                        highlightTrainLines.set(willBeEnabled);
                                    }}
                                />
                            </div>
                            {$highlightTrainLines && (
                                <>
                                    <div className="flex flex-col items-center gap-2">
                                        <Label>{tr("options.thunderforestApiKey")}</Label>
                                        <Input
                                            type="text"
                                            value={$thunderforestApiKey}
                                            id="thunderforestApiKey"
                                            onChange={(e) =>
                                                thunderforestApiKey.set(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder={tr("options.thunderforestApiKey")}
                                        />
                                        <p className="text-xs text-gray-500">
                                            {tr("options.thunderforestApiKeyHelp1")}{" "}
                                            <a
                                                href="https://manage.thunderforest.com/users/sign_up?price=hobby-project-usd"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-500 cursor-pointer"
                                            >
                                                {tr("options.thunderforestApiKeyHere")}.
                                            </a>{" "}
                                            {tr("options.thunderforestApiKeyHelp2")}
                                        </p>
                                    </div>
                                    <Separator className="bg-slate-300 w-[280px]" />{" "}
                                </>
                            )}
                            <Separator className="bg-slate-300 w-[280px]" />
                            <div className="flex flex-col items-center gap-2">
                                <Label>{tr("options.pastebinApiKey")}</Label>
                                <Input
                                    type="text"
                                    value={$pastebinApiKey}
                                    id="pastebinApiKey"
                                    onChange={(e) =>
                                        pastebinApiKey.set(e.target.value)
                                    }
                                    placeholder={tr("options.pastebinApiKey")}
                                />
                                <p className="text-xs text-gray-500">
                                    {tr("options.pastebinApiKeyHelp1")}{" "}
                                    <a
                                        href="https://pastebin.com/doc_api"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-500 cursor-pointer"
                                    >
                                        {tr("options.pastebinApiKeyHere")}
                                    </a>
                                    .
                                </p>
                            </div>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    {tr("options.forcePastebin")}
                                </label>
                                <Checkbox
                                    checked={$alwaysUsePastebin}
                                    onCheckedChange={() =>
                                        alwaysUsePastebin.set(
                                            !$alwaysUsePastebin,
                                        )
                                    }
                                />
                            </div>
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    {tr("options.planningMode")}
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
                                    {tr("options.autoSave")}
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
                                    {tr("options.autoZoom")}
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
                                    {tr("options.followMe")}
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
                                    {tr("options.hiderMode")}
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
                                        label={tr("options.hiderLocation")}
                                    />
                                    {!autoSave && (
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500 mt-2"
                                                onClick={save}
                                            >
                                                {tr("options.save")}
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
