import { useStore } from "@nanostores/react";
import {
    ChevronsUpDown,
    Loader2,
    LucideMinusSquare,
    LucidePlusSquare,
    LucideX,
    Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useTutorialStep } from "@/hooks/use-tutorial-step";
import { useDebounce } from "@/hooks/useDebounce";
import {
    additionalMapGeoLocations,
    boundaryDetailLevel,
    DEFAULT_MAP_GEO_LOCATION_OSM_ID,
    hiderMode,
    isLoading,
    mapGeoJSON,
    mapGeoLocation,
    mapRefreshNonce,
    polyGeoJSON,
    questions,
    startingLocation,
} from "@/lib/context";
import { withTask } from "@/lib/progress";
import { cn } from "@/lib/utils";
import {
    CacheType,
    clearCache,
    determineMapBoundaries,
    determineName,
    geocode,
    type OpenStreetMap,
} from "@/maps/api";

const osmRef = (loc: OpenStreetMap) =>
    `${loc.properties.osm_type}/${loc.properties.osm_id}`;

/** Stable list key — never use {@link determineName} alone (duplicate labels break row clicks). */
const placeRowKey = (entry: {
    base?: boolean;
    location: OpenStreetMap;
    added?: boolean;
}) => (entry.base ? "base" : osmRef(entry.location));

export const PlacePicker = ({
    className = "",
}: {
    value?: OpenStreetMap | null;
    debounce?: number;
    placeholder?: string;
    language?: string;
    className?: string;
}) => {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $additionalMapGeoLocations = useStore(additionalMapGeoLocations);
    const $polyGeoJSON = useStore(polyGeoJSON);
    const $isLoading = useStore(isLoading);
    const $boundaryDetailLevel = useStore(boundaryDetailLevel);
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const debouncedValue = useDebounce<string>(inputValue);
    const [results, setResults] = useState<OpenStreetMap[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [upgradingBoundary, setUpgradingBoundary] = useState(false);

    // Stringify the current set of region ids so we can detect if the
    // user switched regions while a detailed-boundary fetch is
    // in-flight. If the snapshot we captured at click-time no longer
    // matches when the fetch returns, the result is for the old region
    // and we must discard it rather than overwrite the new polygon.
    const captureRegionSignature = () =>
        JSON.stringify([
            mapGeoLocation.get()?.properties?.osm_id,
            additionalMapGeoLocations
                .get()
                .map((l) => [l.location.properties.osm_id, l.added, l.base]),
        ]);

    const handleUpgradeBoundary = async () => {
        if (upgradingBoundary) return;
        setUpgradingBoundary(true);
        const signatureBefore = captureRegionSignature();
        try {
            // Show in-flight status in the global progress bar (indeterminate
            // — Overpass doesn't report progress). We still fire a toast on
            // success/error so slow-to-notice users get a second channel.
            const detailed = await withTask(
                "Loading detailed boundary from Overpass…",
                () => determineMapBoundaries({ forceDetailed: true }),
            );
            if (captureRegionSignature() !== signatureBefore) {
                // User picked a different region while we were fetching.
                // The detailed polygon is for the old region - toss it.
                return;
            }
            mapGeoJSON.set(detailed);
            boundaryDetailLevel.set("detailed");
            // Tell Map.tsx to re-render - its refresh effect keys off
            // this nonce in addition to the normal region atoms.
            mapRefreshNonce.set(mapRefreshNonce.get() + 1);
            toast.success("Detailed boundary loaded.", {
                toastId: "boundary-upgrade",
            });
        } catch (err) {
            console.error("Detailed boundary upgrade failed:", err);
            toast.error(
                "Couldn't load detailed boundary (Overpass may be rate-limited). Falling back to simplified polygon.",
                { toastId: "boundary-upgrade" },
            );
        } finally {
            setUpgradingBoundary(false);
        }
    };

    const canUpgradeBoundary =
        !$polyGeoJSON && $boundaryDetailLevel === "simple";

    useEffect(() => {
        // Debounced query effect: resetting/loading-flag bookkeeping is
        // the whole point, so `set-state-in-effect` warnings are expected.

        if (debouncedValue === "") {
            setResults([]);
            return;
        } else {
            setLoading(true);
            setResults([]);
            geocode(debouncedValue, "en")
                .then((x) => {
                    setResults(x);
                    setLoading(false);
                })
                .catch((e) => {
                    console.log(e);
                    setError(true);
                    setLoading(false);
                });
        }
    }, [debouncedValue]);

    const _placeLabels = results.map((r) => determineName(r));
    const _placeLabelCounts: Record<string, number> = {};
    _placeLabels.forEach((l) => {
        _placeLabelCounts[l] = (_placeLabelCounts[l] || 0) + 1;
    });
    const _placeSeen: Record<string, number> = {};

    return (
        <Popover open={useTutorialStep(open, [3])} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-[300px] justify-between light text-slate-700",
                        className,
                    )}
                    data-tutorial-id="place-picker"
                >
                    {$polyGeoJSON
                        ? "Polygon selected"
                        : $mapGeoLocation &&
                            $mapGeoLocation.properties &&
                            $mapGeoLocation.properties.name
                          ? [
                                $mapGeoLocation,
                                ...$additionalMapGeoLocations.map(
                                    (x) => x.location,
                                ),
                            ]
                                .map((location) => determineName(location))
                                .join("; ")
                          : "Hiding bounds"}
                    <ChevronsUpDown className="opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className={cn(
                    "w-[300px] p-0 light flex flex-col overflow-hidden",
                    // Long multi-region lists used to grow past the viewport so the
                    // search field sat below the fold with no obvious scroll target.
                    "max-h-[min(92dvh,36rem)]",
                )}
                data-tutorial-id="place-picker-content"
            >
                <div
                    className={cn(
                        "font-normal flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
                        $polyGeoJSON && "bg-muted text-muted-foreground",
                    )}
                >
                    {[
                        { location: $mapGeoLocation, added: true, base: true },
                        ...$additionalMapGeoLocations,
                    ].map((location, index) => (
                        <div
                            className={cn(
                                "flex justify-between items-center px-3 py-2",
                                index % 2 === 1 && "bg-slate-100",
                                !$polyGeoJSON &&
                                    "transition-colors duration-200 hover:bg-slate-200",
                            )}
                            key={placeRowKey(location)}
                        >
                            <span className="w-[78%] text-ellipsis">
                                {determineName(location.location)}
                            </span>
                            <div
                                className={cn(
                                    "flex flex-row gap-2 *:stroke-[1.5]",
                                    $polyGeoJSON && "hidden",
                                )}
                            >
                                {!location.base &&
                                    (location.added ? (
                                        <LucidePlusSquare
                                            className={cn(
                                                "text-green-700 cursor-pointer",
                                                $isLoading &&
                                                    "text-muted-foreground cursor-not-allowed",
                                            )}
                                            onClick={() => {
                                                if ($isLoading) return;

                                                location.added = false;

                                                additionalMapGeoLocations.set([
                                                    ...$additionalMapGeoLocations,
                                                ]);
                                                mapGeoJSON.set(null);
                                                polyGeoJSON.set(null);
                                                questions.set([
                                                    ...questions.get(),
                                                ]);
                                            }}
                                        />
                                    ) : (
                                        <LucideMinusSquare
                                            className={cn(
                                                "text-red-700 cursor-pointer",
                                                $isLoading &&
                                                    "text-muted-foreground cursor-not-allowed",
                                            )}
                                            onClick={() => {
                                                if ($isLoading) return;

                                                location.added = true;

                                                additionalMapGeoLocations.set([
                                                    ...$additionalMapGeoLocations,
                                                ]);
                                                mapGeoJSON.set(null);
                                                polyGeoJSON.set(null);
                                                questions.set([
                                                    ...questions.get(),
                                                ]);
                                            }}
                                        />
                                    ))}
                                <LucideX
                                    className={cn(
                                        "scale-[90%] text-gray-700 cursor-pointer hover:bg-slate-300 rounded-full transition-colors duration-200",
                                    )}
                                    onClick={() => {
                                        if (location.base) {
                                            const addedLocations =
                                                $additionalMapGeoLocations.filter(
                                                    (x) => x.added === true,
                                                );

                                            if (addedLocations.length > 0) {
                                                addedLocations[0].base = true;
                                                additionalMapGeoLocations.set(
                                                    additionalMapGeoLocations
                                                        .get()
                                                        .filter(
                                                            (x) =>
                                                                x.base !== true,
                                                        ),
                                                );
                                                mapGeoLocation.set(
                                                    addedLocations[0].location,
                                                );
                                            } else {
                                                return toast.error(
                                                    "Please add another location in addition mode.",
                                                    {
                                                        autoClose: 3000,
                                                    },
                                                );
                                            }
                                        } else {
                                            additionalMapGeoLocations.set(
                                                $additionalMapGeoLocations.filter(
                                                    (x) =>
                                                        x.location.properties
                                                            .osm_id !==
                                                        location.location
                                                            .properties.osm_id,
                                                ),
                                            );
                                        }

                                        mapGeoJSON.set(null);
                                        polyGeoJSON.set(null);
                                        questions.set([...questions.get()]);
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                    {canUpgradeBoundary && (
                        <>
                            <Separator className="h-px shrink-0" />
                            <button
                                type="button"
                                onClick={handleUpgradeBoundary}
                                disabled={upgradingBoundary || $isLoading}
                                className={cn(
                                    "flex w-full items-start gap-2 px-3 py-2 text-left text-sm",
                                    "text-slate-700 transition-colors duration-150",
                                    "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60",
                                )}
                                aria-label="Load detailed boundary from Overpass"
                            >
                                {upgradingBoundary ? (
                                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                                ) : (
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                )}
                                <span className="flex flex-col">
                                    <span className="font-medium">
                                        {upgradingBoundary
                                            ? "Loading detailed boundary..."
                                            : "Load detailed boundary"}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                        Coastline-precision geometry from
                                        Overpass. Slower, sometimes times out.
                                    </span>
                                </span>
                            </button>
                        </>
                    )}
                </div>
                <Separator className="h-px shrink-0" />
                <Command
                    shouldFilter={false}
                    className="flex shrink-0 flex-col bg-popover"
                >
                    <CommandInput
                        placeholder="Search place..."
                        // onValueChange, NOT onKeyUp: mobile input methods
                        // (swipe typing, autocorrect insertions, long-press
                        // paste) don't reliably fire per-key keyup events, so
                        // keyup-driven search silently never ran on phones —
                        // the picker just showed "No locations found".
                        // onValueChange fires for every input method.
                        onValueChange={setInputValue}
                    />
                    <CommandList>
                        <CommandEmpty>
                            {loading ? (
                                <>Loading...</>
                            ) : error ? (
                                <>
                                    <a
                                        href="https://github.com/komoot/photon"
                                        className="text-blue-500"
                                    >
                                        Photon
                                    </a>{" "}
                                    is down. Please draw a polygon instead at
                                    the bottom left of the map.
                                </>
                            ) : (
                                "No locations found."
                            )}
                        </CommandEmpty>
                        <CommandGroup>
                            {results.map((result) => (
                                <CommandItem
                                    key={osmRef(result)}
                                    value={osmRef(result)}
                                    onSelect={() => {
                                        const currentBase =
                                            mapGeoLocation.get();
                                        const currentAdditionals =
                                            additionalMapGeoLocations.get();
                                        const isDefaultBase =
                                            currentBase.properties.osm_id ===
                                                DEFAULT_MAP_GEO_LOCATION_OSM_ID &&
                                            currentAdditionals.length === 0;

                                        const ref = osmRef(result);
                                        if (osmRef(currentBase) === ref) {
                                            toast.info(
                                                "That place is already your primary region.",
                                                { toastId: "place-dup-base" },
                                            );
                                            setOpen(false);
                                            return;
                                        }
                                        if (
                                            currentAdditionals.some(
                                                (e) =>
                                                    osmRef(e.location) === ref,
                                            )
                                        ) {
                                            toast.info(
                                                "That place is already in the list.",
                                                { toastId: "place-dup-add" },
                                            );
                                            setOpen(false);
                                            return;
                                        }

                                        if (isDefaultBase) {
                                            mapGeoLocation.set(result);
                                        } else {
                                            additionalMapGeoLocations.set([
                                                ...currentAdditionals,
                                                {
                                                    added: true,
                                                    location: result,
                                                    base: false,
                                                },
                                            ]);
                                        }
                                        mapGeoJSON.set(null);
                                        polyGeoJSON.set(null);
                                        questions.set([...questions.get()]);
                                        setOpen(false);
                                    }}
                                    className="cursor-pointer"
                                >
                                    {(() => {
                                        const _label = determineName(result);
                                        const _num = (_placeSeen[_label] =
                                            (_placeSeen[_label] || 0) + 1);
                                        return _placeLabelCounts[_label] > 1
                                            ? `${_label} (${_num})`
                                            : _label;
                                    })()}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                    <Button
                        variant="outline"
                        className="font-normal bg-slate-50 hover:bg-slate-200"
                        onClick={() => {
                            // Full new-game reset: clear questions, all
                            // selected regions, hider state, drawn polygon,
                            // and zone cache. Keeps non-game settings
                            // (API keys, unit preference, tile layer, etc.).
                            questions.set([]);
                            mapGeoJSON.set(null);
                            polyGeoJSON.set(null);
                            additionalMapGeoLocations.set([]);
                            hiderMode.set(false);
                            startingLocation.set(false);
                            clearCache(CacheType.ZONE_CACHE);
                        }}
                    >
                        New Game
                    </Button>
                    {$polyGeoJSON && (
                        <Button
                            variant="outline"
                            className="font-normal hover:bg-slate-200"
                            onClick={() => {
                                polyGeoJSON.set(null);
                                mapGeoJSON.set(null);
                                questions.set([...questions.get()]);
                            }}
                        >
                            Reuse Preset Locations
                        </Button>
                    )}
                </Command>
            </PopoverContent>
        </Popover>
    );
};
