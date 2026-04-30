import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import {
    additionalMapGeoLocations,
    allowGooglePlusCodes,
    alwaysUsePastebin,
    animateMapMovements,
    autoSave,
    autoZoom,
    baseTileLayer,
    casServerEffectiveUrl,
    casServerStatus,
    casServerUrl,
    currentSid,
    customInitPreference,
    customPresets,
    customStations,
    defaultCustomQuestions,
    defaultUnit,
    disabledStations,
    displayHidingZonesOptions,
    followMe,
    hiderMode,
    hidingRadius,
    hidingRadiusUnits,
    hidingZone,
    includeDefaultStations,
    leafletMapContext,
    liveSyncEnabled,
    mapGeoJSON,
    mapGeoLocation,
    pastebinApiKey,
    permanentOverlay,
    planningModeEnabled,
    polyGeoJSON,
    questions,
    save,
    showTutorial,
    thunderforestApiKey,
    triggerLocalRefresh,
    useCustomStations,
} from "@/lib/context";
import { getBlob } from "@/lib/cas";
import { discoverCasServer } from "@/lib/casDiscovery";
import {
    applyWireV1Payload,
    loadHidingZoneFromJsonString,
} from "@/lib/loadHidingZone";
import {
    cloneForWire,
    flushLiveSync,
    initLiveSync,
    setHydrating,
} from "@/lib/liveSync";
import { buildWireV1Envelope, canonicalize } from "@/lib/wire";
import {
    cn,
    compress,
    decompress,
    fetchFromPastebin,
    shareOrFallback,
    uploadToPastebin,
} from "@/lib/utils";
import { TeamPanel } from "./TeamPanel";
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
const SID_URL_PARAM = "sid";

/** Accept raw sid or a share URL containing `sid=` */
function parseSessionIdFromClipboard(text: string): string {
    const t = text.trim();
    if (!t) return "";
    try {
        const u = new URL(t);
        const sid = u.searchParams.get(SID_URL_PARAM);
        if (sid) return sid;
    } catch {
        /* not an absolute URL */
    }
    const match = t.match(new RegExp(`[?&]${SID_URL_PARAM}=([^&\\s#]+)`, "i"));
    if (match) {
        try {
            return decodeURIComponent(match[1]);
        } catch {
            return match[1];
        }
    }
    return t;
}

export const OptionDrawers = ({ className }: { className?: string }) => {
    useStore(triggerLocalRefresh);
    const $defaultCustomQuestions = useStore(defaultCustomQuestions);
    const $allowGooglePlusCodes = useStore(allowGooglePlusCodes);
    const $defaultUnit = useStore(defaultUnit);
    const $animateMapMovements = useStore(animateMapMovements);
    const $autoZoom = useStore(autoZoom);
    const $hiderMode = useStore(hiderMode);
    const $autoSave = useStore(autoSave);
    const $hidingZone = useStore(hidingZone);
    const $planningMode = useStore(planningModeEnabled);
    const $baseTileLayer = useStore(baseTileLayer);
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const $pastebinApiKey = useStore(pastebinApiKey);
    const $alwaysUsePastebin = useStore(alwaysUsePastebin);
    const $followMe = useStore(followMe);
    const $customInitPref = useStore(customInitPreference);
    const $casServerUrl = useStore(casServerUrl);
    const $casStatus = useStore(casServerStatus);
    const $liveSyncEnabled = useStore(liveSyncEnabled);
    const lastDefaultUnit = useRef($defaultUnit);
    const hasSyncedInitialUnit = useRef(false);
    const [isOptionsOpen, setOptionsOpen] = useState(false);
    const [clientMounted, setClientMounted] = useState(false);
    const [replaceStateOpen, setReplaceStateOpen] = useState(false);
    const resolveReplaceRef = useRef<((value: boolean) => void) | null>(null);

    const askReplaceGameState = useCallback((): Promise<boolean> => {
        return new Promise((resolve) => {
            resolveReplaceRef.current = resolve;
            setReplaceStateOpen(true);
        });
    }, []);

    const closeReplacePrompt = useCallback((accepted: boolean) => {
        resolveReplaceRef.current?.(accepted);
        resolveReplaceRef.current = null;
        setReplaceStateOpen(false);
    }, []);

    const applyIncomingWire = useCallback(
        async (canonicalJson: string, sid: string) => {
            setHydrating(true);
            try {
                applyWireV1Payload(canonicalJson);
                currentSid.set(sid);
            } finally {
                setHydrating(false);
            }
        },
        [],
    );

    const maybeReplaceThenApply = useCallback(
        async (canonicalJson: string, sid: string): Promise<boolean> => {
            const hasLocal =
                questions.get().length > 0 || polyGeoJSON.get() !== null;
            if (hasLocal && sid !== currentSid.get()) {
                let incomingCanon: string | null = null;
                try {
                    incomingCanon = canonicalize(JSON.parse(canonicalJson));
                } catch {
                    incomingCanon = null;
                }
                const localCanon = canonicalize(
                    buildWireV1Envelope(cloneForWire(hidingZone.get())),
                );
                const samePayload =
                    incomingCanon !== null && incomingCanon === localCanon;
                if (!samePayload) {
                    const ok = await askReplaceGameState();
                    if (!ok) return false;
                }
            }
            await applyIncomingWire(canonicalJson, sid);
            return true;
        },
        [applyIncomingWire, askReplaceGameState],
    );

    const maybeReplaceRef = useRef(maybeReplaceThenApply);
    maybeReplaceRef.current = maybeReplaceThenApply;

    const pasteSessionIdFromClipboard = useCallback(async () => {
        if (!navigator?.clipboard) {
            toast.error("Clipboard not supported");
            return;
        }
        await discoverCasServer();
        const base = casServerEffectiveUrl.get();
        if (!base || casServerStatus.get() !== "available") {
            toast.error("Game state server not available");
            return;
        }
        let sid: string;
        try {
            sid = parseSessionIdFromClipboard(
                await navigator.clipboard.readText(),
            );
        } catch {
            toast.error("Could not read clipboard");
            return;
        }
        if (!sid) {
            toast.error("Clipboard is empty");
            return;
        }
        try {
            const compressed = await getBlob(base, sid);
            const json = await decompress(compressed);
            const applied = await maybeReplaceThenApply(json, sid);
            if (!applied) {
                toast.info("Load cancelled");
            }
        } catch (e) {
            toast.error(`Could not load session (${sid}): ${e}`);
        }
    }, [maybeReplaceThenApply]);

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
        initLiveSync();
    }, []);

    useEffect(() => {
        setClientMounted(true);
    }, []);

    useEffect(() => {
        const url = new URL(window.location.toString());
        const params = url.searchParams;
        const sidParam = params.get(SID_URL_PARAM);
        const hidingZoneOld = params.get(HIDING_ZONE_URL_PARAM);
        const hidingZoneCompressed = params.get(
            HIDING_ZONE_COMPRESSED_URL_PARAM,
        );
        const pastebinId = params.get(PASTEBIN_URL_PARAM);

        void (async () => {
            await discoverCasServer();

            let sidApplied = false;
            if (sidParam && casServerEffectiveUrl.get()) {
                try {
                    const compressed = await getBlob(
                        casServerEffectiveUrl.get()!,
                        sidParam,
                    );
                    const json = await decompress(compressed);
                    sidApplied = await maybeReplaceRef.current(
                        json,
                        sidParam,
                    );
                } catch (e) {
                    toast.error(
                        `Could not load shared game state (${sidParam}): ${e}`,
                    );
                }
            }

            if (sidApplied) {
                return;
            }

            if (hidingZoneOld !== null) {
                try {
                    loadHidingZoneFromJsonString(atob(hidingZoneOld));
                    window.history.replaceState({}, "", window.location.pathname);
                } catch (e) {
                    toast.error(`Invalid hiding zone settings: ${e}`);
                }
            } else if (hidingZoneCompressed !== null) {
                decompress(hidingZoneCompressed)
                    .then((data) => {
                        try {
                            loadHidingZoneFromJsonString(data);
                            window.history.replaceState(
                                {},
                                "",
                                window.location.pathname,
                            );
                        } catch (e) {
                            toast.error(`Invalid hiding zone settings: ${e}`);
                        }
                    })
                    .catch((e) =>
                        toast.error(`Invalid hiding zone settings: ${e}`),
                    );
            } else if (pastebinId !== null) {
                fetchFromPastebin(pastebinId)
                    .then((data) => {
                        try {
                            loadHidingZoneFromJsonString(data);
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
        })();
    }, []);

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
                    const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
                    let shareUrl: string | null = null;

                    if ($casStatus === "available") {
                        try {
                            await flushLiveSync();
                            const sid = currentSid.get();
                            if (sid) {
                                shareUrl = `${baseUrl}?${SID_URL_PARAM}=${encodeURIComponent(sid)}`;
                            }
                        } catch (e) {
                            toast.warn(`Could not sync to game state server: ${e}`);
                        }
                    }

                    const hidingZoneString = JSON.stringify($hidingZone);
                    let compressedData: string | undefined;

                    if (!shareUrl) {
                        try {
                            compressedData = await compress(hidingZoneString);
                        } catch (error) {
                            console.error("Compression failed:", error);
                            toast.error(`Failed to prepare data for sharing`);
                            return;
                        }

                        shareUrl = `${baseUrl}?${HIDING_ZONE_COMPRESSED_URL_PARAM}=${compressedData}`;
                    }

                    if ($alwaysUsePastebin || shareUrl.length > 2000) {
                        if (!$pastebinApiKey) {
                            toast.error(
                                "Data is too large for a URL or Pastebin is forced. Please enter a Pastebin API key in Options to share via Pastebin.",
                            );
                            return;
                        }
                        try {
                            toast.info("Data is being shared via Pastebin...");
                            const pastebinUrl = await uploadToPastebin(
                                $pastebinApiKey,
                                hidingZoneString,
                            );
                            const pasteId = pastebinUrl.substring(
                                pastebinUrl.lastIndexOf("/") + 1,
                            );
                            shareUrl = `${baseUrl}?${PASTEBIN_URL_PARAM}=${pasteId}`;
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
                    await shareOrFallback(shareUrl!).then((result) => {
                        console.log(`result ${result}`);
                        if (result === false) {
                            return toast.error(
                                `Clipboard not supported. Try manually copying/pasting: ${shareUrl}`,
                                { className: "p-0 w-[1000px]" },
                            );
                        }

                        if (result === "clipboard") {
                            toast.success(
                                "Hiding zone URL copied to clipboard",
                                {
                                    autoClose: 2000,
                                },
                            );
                        }
                    });
                }}
                data-tutorial-id="share-questions-button"
            >
                Share
            </Button>
            <Button
                className="w-24 shadow-md"
                onClick={() => {
                    showTutorial.set(true);
                }}
            >
                Tutorial
            </Button>
            <Drawer open={isOptionsOpen} onOpenChange={setOptionsOpen}>
                <DrawerTrigger className="w-24" asChild>
                    <Button
                        className="w-24 shadow-md"
                        data-tutorial-id="option-questions-button"
                    >
                        Options
                    </Button>
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
                                {$casStatus === "available" ? (
                                    <>
                                        <Button
                                            onClick={() => {
                                                if (
                                                    !navigator ||
                                                    !navigator.clipboard
                                                ) {
                                                    return toast.error(
                                                        "Clipboard not supported",
                                                    );
                                                }
                                                const sid = currentSid.get();
                                                if (!sid) {
                                                    return toast.error(
                                                        "No session ID yet. Share your game or enable CAS sync and edit.",
                                                    );
                                                }
                                                navigator.clipboard.writeText(
                                                    sid,
                                                );
                                                toast.success(
                                                    "Session ID copied",
                                                    {
                                                        autoClose: 2000,
                                                    },
                                                );
                                            }}
                                        >
                                            Copy Session ID
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                void pasteSessionIdFromClipboard();
                                            }}
                                        >
                                            Paste Session ID
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            onClick={() => {
                                                if (
                                                    !navigator ||
                                                    !navigator.clipboard
                                                ) {
                                                    return toast.error(
                                                        "Clipboard not supported",
                                                    );
                                                }
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
                                                if (
                                                    !navigator ||
                                                    !navigator.clipboard
                                                ) {
                                                    return toast.error(
                                                        "Clipboard not supported",
                                                    );
                                                }
                                                navigator.clipboard
                                                    .readText()
                                                    .then(
                                                        loadHidingZoneFromJsonString,
                                                    );
                                            }}
                                        >
                                            Paste Hiding Zone
                                        </Button>
                                    </>
                                )}
                            </div>
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>Game state server (optional)</Label>
                            <Input
                                type="url"
                                className="max-w-md"
                                placeholder="https://your-server.example"
                                value={$casServerUrl}
                                onChange={(e) =>
                                    casServerUrl.set(e.target.value.trim())
                                }
                            />
                            <div className="flex flex-wrap items-center gap-2 justify-center">
                                <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                        $casStatus === "available"
                                            ? "bg-emerald-100 text-emerald-900"
                                            : $casStatus === "unavailable"
                                              ? "bg-rose-100 text-rose-900"
                                              : "bg-slate-100 text-slate-700"
                                    }`}
                                >
                                    CAS: {$casStatus}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        void discoverCasServer().then(() =>
                                            toast.info(
                                                casServerStatus.get() ===
                                                    "available"
                                                    ? "Connected to game state server"
                                                    : "Could not reach game state server",
                                                { autoClose: 2000 },
                                            ),
                                        )
                                    }
                                >
                                    Test connection
                                </Button>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex flex-row items-center gap-2">
                                    <label className="text-2xl font-semibold font-poppins">
                                        Auto-sync URL with edits (CAS)
                                    </label>
                                    <Checkbox
                                        checked={$liveSyncEnabled}
                                        onCheckedChange={() =>
                                            liveSyncEnabled.set(
                                                !$liveSyncEnabled,
                                            )
                                        }
                                    />
                                </div>
                                <p className="text-sm text-muted-foreground max-w-[300px]">
                                    Sync waits until every question is locked;
                                    Share still publishes the current state
                                    immediately.
                                </p>
                            </div>
                            <TeamPanel
                                optionsOpen={isOptionsOpen}
                                onLoadCasWire={maybeReplaceThenApply}
                            />
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>Default Unit</Label>
                            <UnitSelect
                                unit={$defaultUnit}
                                onChange={defaultUnit.set}
                            />
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>New Custom Question Defaults</Label>
                            <Select
                                trigger="New custom default"
                                options={{
                                    ask: "Ask each time",
                                    blank: "Start blank",
                                    prefill: "Copy from current",
                                }}
                                value={$customInitPref}
                                onValueChange={(v) =>
                                    customInitPreference.set(v as any)
                                }
                            />
                            <Separator className="bg-slate-300 w-[280px]" />
                            <Label>Base map style</Label>
                            <Select
                                trigger="Base map style"
                                options={{
                                    voyager: "CARTO Voyager",
                                    light: "CARTO Light",
                                    dark: "CARTO Dark",
                                    transport: "Thunderforest Transport",
                                    neighbourhood:
                                        "Thunderforest Neighbourhood",
                                    osmcarto: "OpenStreetMap Carto",
                                }}
                                value={$baseTileLayer}
                                onValueChange={(v) =>
                                    baseTileLayer.set(v as any)
                                }
                            />
                            <div className="flex flex-col items-center gap-2">
                                <Label>Thunderforest API Key</Label>
                                <Input
                                    type="text"
                                    value={$thunderforestApiKey}
                                    id="thunderforestApiKey"
                                    onChange={(e) =>
                                        thunderforestApiKey.set(e.target.value)
                                    }
                                    placeholder="Enter your Thunderforest API key"
                                />
                                <p className="text-xs text-gray-500">
                                    Needed for Thunderforest map styles. Create
                                    a key{" "}
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
                            <Separator className="bg-slate-300 w-[280px]" />
                            <div className="flex flex-col items-center gap-2">
                                <Label>Pastebin API Key</Label>
                                <Input
                                    type="text"
                                    value={$pastebinApiKey}
                                    id="pastebinApiKey"
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
                            <Label>Permanent Map Overlay</Label>
                            <div className="flex flex-row max-[330px]:flex-col gap-4">
                                <Button
                                    onClick={() => permanentOverlay.set(null)}
                                >
                                    Remove
                                </Button>
                                <Button
                                    onClick={async () => {
                                        if (!navigator || !navigator.clipboard)
                                            return toast.error(
                                                "Clipboard not supported",
                                            );

                                        try {
                                            const clipboard =
                                                await navigator.clipboard.readText();
                                            const geojson =
                                                JSON.parse(clipboard);
                                            permanentOverlay.set(geojson);
                                        } catch (e) {
                                            toast.error(
                                                `Invalid GeoJSON overlay: ${e}`,
                                            );
                                        }
                                    }}
                                >
                                    Paste GeoJSON
                                </Button>
                            </div>
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
                                    Force Pastebin for sharing?
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
                                    Default to custom questions?
                                </label>
                                <Checkbox
                                    checked={$defaultCustomQuestions}
                                    onCheckedChange={() =>
                                        defaultCustomQuestions.set(
                                            !$defaultCustomQuestions,
                                        )
                                    }
                                />
                            </div>
                            <div className="flex flex-row items-center gap-2">
                                <label className="text-2xl font-semibold font-poppins">
                                    Allow Google Plus codes?
                                </label>
                                <Checkbox
                                    checked={$allowGooglePlusCodes}
                                    onCheckedChange={() =>
                                        allowGooglePlusCodes.set(
                                            !$allowGooglePlusCodes,
                                        )
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
            {clientMounted ? (
                <AlertDialog
                    open={replaceStateOpen}
                    onOpenChange={(open) => {
                        setReplaceStateOpen(open);
                        if (!open && resolveReplaceRef.current) {
                            resolveReplaceRef.current(false);
                            resolveReplaceRef.current = null;
                        }
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Replace current game state?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Loading this snapshot will replace your current
                                questions and map data in this browser.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => closeReplacePrompt(true)}
                            >
                                Replace
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            ) : null}
        </div>
    );
};
