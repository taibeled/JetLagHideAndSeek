import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "react-toastify";

import { QuestionCard } from "@/components/cards/base";
import CustomInitDialog from "@/components/CustomInitDialog";
import { FacilityOsmPlayToggles } from "@/components/FacilityOsmPlayToggles";
import { LatitudeLongitude } from "@/components/LatLngPicker";
import PresetsDialog from "@/components/PresetsDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useOverpassCandidateList } from "@/hooks/use-overpass-candidate-list";
import {
    additionalMapGeoLocations,
    customInitPreference,
    displayHidingZones,
    drawingQuestionKey,
    hiderMode,
    isLoading,
    mapGeoLocation,
    polyGeoJSON,
    questionModified,
    questions,
    trainStations,
    triggerLocalRefresh,
} from "@/lib/context";
import { getSubwayLineRefOptionsFromGtfs } from "@/lib/transit/line-membership";
import { cn } from "@/lib/utils";
import { trainLineRefsForStation } from "@/maps/api/overpass";
import {
    determineMatchingBoundary,
    findMatchingPlaces,
    listAirportMatchingCandidates,
    normalizeMatchingAirportIata,
} from "@/maps/questions/matching";
import {
    determineUnionizedStrings,
    type MatchingQuestion,
    matchingQuestionSchema,
    NO_GROUP,
} from "@/maps/schema";

function AirportPlayToggles({
    data,
    questionKey,
}: {
    data: MatchingQuestion & { type: "airport" };
    questionKey: number;
}) {
    const $displayHidingZones = useStore(displayHidingZones);
    const $isLoading = useStore(isLoading);
    const $polyGeo = useStore(polyGeoJSON);
    const $mapLoc = useStore(mapGeoLocation);
    const $additional = useStore(additionalMapGeoLocations);
    const refreshToken = React.useMemo(
        () => ({
            questionKey,
            activeOnly: data.activeOnly,
            type: data.type,
            poly: $polyGeo,
            map: $mapLoc,
            additional: $additional,
        }),
        [
            questionKey,
            data.activeOnly,
            data.type,
            $polyGeo,
            $mapLoc,
            $additional,
        ],
    );
    const loadCandidates = React.useCallback(
        () => listAirportMatchingCandidates(data),
        [data],
    );
    const { items: candidates, loading } = useOverpassCandidateList(
        $displayHidingZones,
        loadCandidates,
        refreshToken,
    );

    const disabledSet = new Set(
        (data.disabledAirportIatas ?? []).map(normalizeMatchingAirportIata),
    );

    return (
        <>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <div className="flex flex-row items-center justify-between w-full">
                    <Label className="font-semibold">
                        Active airports only?
                    </Label>
                    <Checkbox
                        checked={data.activeOnly}
                        onCheckedChange={(v) =>
                            questionModified((data.activeOnly = !!v))
                        }
                        disabled={!data.drag || $isLoading}
                    />
                </div>
            </SidebarMenuItem>
            <SidebarMenuItem
                className={`${MENU_ITEM_CLASSNAME} flex-col items-stretch gap-2`}
            >
                {!$displayHidingZones ? (
                    <p className="text-xs text-muted-foreground px-1">
                        Turn on hiding zones to load airports for this
                        territory.
                    </p>
                ) : loading ? (
                    <div className="flex justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                ) : candidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-1">
                        No IATA airports found in this territory.
                    </p>
                ) : (
                    <>
                        <Label className="text-xs font-semibold">
                            Airports in play
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            Uncheck to exclude an airport from matching (e.g.
                            TEB, FRG, HVN).
                        </p>
                        <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-md border border-border p-2">
                            {[...candidates]
                                .sort((a, b) =>
                                    String(
                                        (a.properties as { name?: string })
                                            ?.name ?? "",
                                    ).localeCompare(
                                        String(
                                            (b.properties as { name?: string })
                                                ?.name ?? "",
                                        ),
                                    ),
                                )
                                .map((pt) => {
                                    const iata = normalizeMatchingAirportIata(
                                        String(
                                            (pt.properties as { iata?: string })
                                                ?.iata ?? "",
                                        ),
                                    );
                                    const name =
                                        (pt.properties as { name?: string })
                                            ?.name ?? iata;
                                    const inPlay = !disabledSet.has(iata);
                                    return (
                                        <label
                                            key={iata}
                                            className="flex cursor-pointer items-start gap-2 text-xs"
                                        >
                                            <Checkbox
                                                className="mt-0.5"
                                                checked={inPlay}
                                                onCheckedChange={(v) => {
                                                    const next = new Set(
                                                        (
                                                            data.disabledAirportIatas ??
                                                            []
                                                        ).map(
                                                            normalizeMatchingAirportIata,
                                                        ),
                                                    );
                                                    if (v === true)
                                                        next.delete(iata);
                                                    else next.add(iata);
                                                    data.disabledAirportIatas =
                                                        [...next].sort();
                                                    questionModified();
                                                }}
                                                disabled={
                                                    !data.drag || $isLoading
                                                }
                                            />
                                            <span className="min-w-0 leading-snug">
                                                <span className="font-mono tabular-nums">
                                                    {iata}
                                                </span>
                                                {name !== iata ? (
                                                    <span className="text-muted-foreground">
                                                        {" "}
                                                        {name}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </label>
                                    );
                                })}
                        </div>
                    </>
                )}
            </SidebarMenuItem>
        </>
    );
}

export const MatchingQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: {
    data: MatchingQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const $displayHidingZones = useStore(displayHidingZones);
    const $drawingQuestionKey = useStore(drawingQuestionKey);
    const $isLoading = useStore(isLoading);
    const $customInitPref = useStore(customInitPreference);
    const $trainStations = useStore(trainStations);
    const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
    const [pendingCustomType, setPendingCustomType] = React.useState<
        "custom-zone" | "custom-points" | null
    >(null);
    const [trainLineOptions, setTrainLineOptions] = React.useState<string[]>(
        [],
    );
    const [trainLineOptionsLoading, setTrainLineOptionsLoading] =
        React.useState(false);
    const label = `Matching
    ${
        $questions
            .filter((q) => q.id === "matching")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    let questionSpecific = <></>;

    const nearestTrainStationForLineQuestion = React.useMemo(() => {
        if (data.type !== "same-train-line") return null;
        if ($trainStations.length === 0) return null;
        try {
            const location = turf.point([data.lng, data.lat]);
            return turf.nearestPoint(
                location,
                turf.featureCollection(
                    $trainStations.map((station) => station.properties),
                ) as any,
            );
        } catch {
            return null;
        }
    }, [data.lng, data.lat, data.type, $trainStations]);

    const nearestTrainStationId =
        typeof nearestTrainStationForLineQuestion?.properties?.id === "string"
            ? nearestTrainStationForLineQuestion.properties.id
            : "";
    const nearestTrainStationName =
        (nearestTrainStationForLineQuestion?.properties?.["name:en"] as
            | string
            | undefined) ??
        (nearestTrainStationForLineQuestion?.properties?.name as
            | string
            | undefined) ??
        "nearest station";

    // Pulled out so the useMemo deps below stay statically analyzable
    // (@eslint-react/exhaustive-deps rejects ternaries in dep arrays).
    const trainLineRefForMemo =
        data.type === "same-train-line"
            ? ((data as { lineRef?: string }).lineRef ?? "")
            : "";

    const trainLineChips = React.useMemo(() => {
        if (data.type !== "same-train-line") return [];
        const manual = trainLineRefForMemo.trim();
        const seen = new Set<string>();
        const out: string[] = [];
        for (const r of trainLineOptions) {
            const k = r.toUpperCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(r);
        }
        if (manual) {
            const k = manual.toUpperCase();
            if (!seen.has(k)) {
                seen.add(k);
                out.push(manual);
            }
        }
        return out.sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true }),
        );
    }, [data.type, trainLineOptions, trainLineRefForMemo]);

    React.useEffect(() => {
        // The synchronous setState calls in this effect are deliberate:
        // they reset the chip list when the question type changes or when
        // there's no station to query. @eslint-react/set-state-in-effect
        // wants async-gated updates, which would mean an extra render where
        // stale chips are briefly visible — worse UX than the warning.

        if (data.type !== "same-train-line") {
            setTrainLineOptions([]);
            setTrainLineOptionsLoading(false);
            return;
        }
        if (!nearestTrainStationId || !nearestTrainStationId.includes("/")) {
            setTrainLineOptions([]);
            setTrainLineOptionsLoading(false);
            return;
        }

        let cancelled = false;
        setTrainLineOptionsLoading(true);

        trainLineRefsForStation(nearestTrainStationId, {
            latitude: data.lat,
            longitude: data.lng,
        })
            .then(async (osmRefs) => {
                if (cancelled) return;
                const fromOsm = osmRefs.length > 0;
                const refs = fromOsm
                    ? osmRefs
                    : await getSubwayLineRefOptionsFromGtfs();
                if (cancelled) return;
                setTrainLineOptions(refs);
                const currentRef = (data.lineRef ?? "").trim();
                if (refs.length === 0) {
                    return;
                }
                if (!currentRef) {
                    if (fromOsm || refs.length === 1) {
                        questionModified((data.lineRef = refs[0]!));
                    }
                    return;
                }
                const fuzzy = refs.find(
                    (r) => r.toUpperCase() === currentRef.toUpperCase(),
                );
                if (fuzzy && fuzzy !== currentRef) {
                    questionModified((data.lineRef = fuzzy));
                    return;
                }
                if (fuzzy) {
                    return;
                }
                if (fromOsm) {
                    questionModified((data.lineRef = refs[0]!));
                }
            })
            .catch(async () => {
                if (cancelled) return;
                try {
                    const gtfs = await getSubwayLineRefOptionsFromGtfs();
                    if (!cancelled) setTrainLineOptions(gtfs);
                } catch {
                    if (!cancelled) setTrainLineOptions([]);
                }
            })
            .finally(() => {
                if (!cancelled) setTrainLineOptionsLoading(false);
            });

        return () => {
            cancelled = true;
        };
        // `data` isn't a dep on purpose: this effect mutates `data.lineRef`
        // via questionModified, so re-running on every lineRef change would
        // create a feedback loop. The granular deps below cover every input
        // that should re-trigger the fetch.
    }, [data.type, nearestTrainStationId, data.lat, data.lng]);

    switch (data.type) {
        case "pick-type":
            questionSpecific = (
                <p className="px-2 text-center text-sm text-muted-foreground">
                    Choose a matching type above. No Overpass or facility fetch
                    runs until you pick one.
                </p>
            );
            break;
        case "same-landmass":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    Uses island polygons when available; falls back to
                    county-ish mainland boundaries where island data is missing.
                </span>
            );
            break;
        case "same-zip":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    Uses OSM postal-code boundaries for the seeker location.
                </span>
            );
            break;
        case "same-district":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    Uses tagged political districts when available; otherwise
                    falls back to county/state-level admin boundaries.
                </span>
            );
            break;
        case "zone":
        case "same-admin-zone":
        case "letter-zone":
            questionSpecific = (
                <>
                    <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                        <Select
                            trigger="OSM Zone"
                            options={{
                                2: "Admin L2 (country)",
                                3: "Admin L3 (region/borough in some areas)",
                                4: "Admin L4 (state/province/county in some areas)",
                                5: "Admin L5 (county/city in some areas)",
                                6: "Admin L6 (NYC boroughs / county district in some areas)",
                                7: "Admin L7 (district/borough in some areas)",
                                8: "Admin L8 (city/town in many areas)",
                                9: "Admin L9 (city subdivision/neighborhood)",
                                10: "Admin L10 (small local subdivision)",
                            }}
                            value={data.cat.adminLevel.toString()}
                            onValueChange={(value) =>
                                questionModified(
                                    (data.cat.adminLevel = parseInt(value) as
                                        | 2
                                        | 3
                                        | 4
                                        | 5
                                        | 6
                                        | 7
                                        | 8
                                        | 9
                                        | 10),
                                )
                            }
                            disabled={!data.drag || $isLoading}
                        />
                    </SidebarMenuItem>
                    {data.type === "letter-zone" && (
                        <span className="px-2 text-center text-orange-500">
                            Warning: The zone data has been simplified by
                            &plusmn;360 feet (100 meters) in order for the
                            browser to not crash.
                        </span>
                    )}
                </>
            );
            break;
        case "airport":
            questionSpecific = (
                <AirportPlayToggles
                    data={data as MatchingQuestion & { type: "airport" }}
                    questionKey={questionKey}
                />
            );
            break;
        case "major-city":
        case "aquarium-full":
        case "zoo-full":
        case "theme_park-full":
        case "peak-full":
        case "museum-full":
        case "hospital-full":
        case "hospital-nyc-full":
        case "cinema-full":
        case "library-full":
        case "golf_course-full":
        case "consulate-full":
        case "park-full":
            questionSpecific = (
                <FacilityOsmPlayToggles data={data} questionKey={questionKey} />
            );
            break;
        case "same-train-line":
            questionSpecific = (
                <>
                    <SidebarMenuItem
                        className={`${MENU_ITEM_CLASSNAME} flex-col items-start gap-1.5`}
                    >
                        <Label className="font-semibold">
                            Line choices from {nearestTrainStationName}
                        </Label>
                        {trainLineOptionsLoading ? (
                            <div className="flex justify-center py-1 w-full">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : trainLineChips.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {trainLineChips.map((lineRef) => {
                                    const selected =
                                        (data.lineRef ?? "")
                                            .trim()
                                            .toUpperCase() ===
                                        lineRef.toUpperCase();
                                    return (
                                        <button
                                            key={lineRef}
                                            type="button"
                                            className={cn(
                                                "rounded-md border px-2 py-1 text-xs font-semibold",
                                                selected
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-background text-foreground",
                                            )}
                                            onClick={() =>
                                                questionModified(
                                                    (data.lineRef = lineRef),
                                                )
                                            }
                                            disabled={!data.drag || $isLoading}
                                        >
                                            {lineRef}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground leading-tight">
                                No line list yet (Overpass offline or no GTFS
                                subway feed). Type a ref below (e.g. 7) or
                                install &quot;NYC Subway&quot; under transit.
                            </p>
                        )}
                    </SidebarMenuItem>
                    <SidebarMenuItem
                        className={`${MENU_ITEM_CLASSNAME} flex-col items-start gap-1.5`}
                    >
                        <Label className="font-semibold">
                            Exact line ref (optional)
                        </Label>
                        <Input
                            value={data.lineRef ?? ""}
                            placeholder="e.g. 7, A, N"
                            onChange={(event) =>
                                questionModified(
                                    (data.lineRef = event.target.value),
                                )
                            }
                            disabled={!data.drag || $isLoading}
                        />
                        <p className="text-xs text-muted-foreground leading-tight">
                            Set this to force exact line filtering. Leave blank
                            to use all lines connected to the selected station.
                        </p>
                    </SidebarMenuItem>
                    <span className="px-2 text-center text-orange-500">
                        Warning: The train line data is based on OpenStreetMap
                        and may have fewer train stations than expected. If you
                        are using this tool, ensure that the other players are
                        also using this tool.
                    </span>
                </>
            );
            break;
        case "aquarium":
        case "hospital":
        case "peak":
        case "museum":
        case "theme_park":
        case "zoo":
        case "cinema":
        case "library":
        case "golf_course":
        case "consulate":
        case "park":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    This question will only influence the map when you click on
                    a hiding zone in the hiding zone sidebar.
                </span>
            );
            break;
        case "custom-zone":
        case "custom-points":
            if (data.drag) {
                questionSpecific = (
                    <>
                        <p className="px-2 mb-1 text-center text-orange-500">
                            To modify the matching{" "}
                            {data.type === "custom-zone" ? "zones" : "points"},
                            enable it:
                            <Checkbox
                                className="mx-1 my-1"
                                checked={$drawingQuestionKey === questionKey}
                                onCheckedChange={(checked) => {
                                    if (checked) {
                                        drawingQuestionKey.set(questionKey);
                                    } else {
                                        drawingQuestionKey.set(-1);
                                    }
                                }}
                                disabled={$isLoading}
                            />
                            and use the buttons at the bottom left of the map.
                        </p>
                        <div className="flex justify-center mb-2">
                            <PresetsDialog
                                data={data}
                                presetTypeHint={data.type}
                            />
                        </div>
                    </>
                );
            }
    }

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            collapsed={data.collapsed}
            setCollapsed={(collapsed) => {
                data.collapsed = collapsed; // Doesn't trigger a re-render so no need for questionModified
            }}
            locked={!data.drag}
            setLocked={(locked) => questionModified((data.drag = !locked))}
        >
            <CustomInitDialog
                open={customDialogOpen}
                onOpenChange={setCustomDialogOpen}
                onBlank={async () => {
                    if (!pendingCustomType) return;
                    if (pendingCustomType === "custom-zone") {
                        (data as any).geo = undefined;
                        toast.info("Please draw the zone on the map.");
                    } else {
                        (data as any).geo = [];
                        toast.info("Please draw the points on the map.");
                    }
                    data.type = pendingCustomType;
                    questionModified();
                    setCustomDialogOpen(false);
                }}
                onPrefill={async () => {
                    if (!pendingCustomType) return;
                    if (pendingCustomType === "custom-zone") {
                        (data as any).geo =
                            await determineMatchingBoundary(data);
                    } else {
                        if (
                            data.type === "airport" ||
                            data.type === "major-city" ||
                            data.type === "aquarium-full" ||
                            data.type === "zoo-full" ||
                            data.type === "theme_park-full" ||
                            data.type === "peak-full" ||
                            data.type === "museum-full" ||
                            data.type === "hospital-full" ||
                            data.type === "hospital-nyc-full" ||
                            data.type === "cinema-full" ||
                            data.type === "library-full" ||
                            data.type === "golf_course-full" ||
                            data.type === "consulate-full" ||
                            data.type === "park-full"
                        ) {
                            (data as any).geo = await findMatchingPlaces(data);
                        } else {
                            (data as any).geo = [];
                            toast.info("Please draw the points on the map.");
                        }
                    }
                    data.type = pendingCustomType;
                    questionModified();
                    setCustomDialogOpen(false);
                }}
            />
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Select
                    trigger="Matching Type"
                    options={Object.fromEntries(
                        matchingQuestionSchema.options
                            .filter((x) => x.description === NO_GROUP)
                            .flatMap((x) =>
                                determineUnionizedStrings(x.shape.type),
                            )
                            .map((x) => [x.value, x.description]),
                    )}
                    groups={matchingQuestionSchema.options
                        .filter((x) => x.description !== NO_GROUP)
                        .map((x) => [
                            x.description,
                            Object.fromEntries(
                                determineUnionizedStrings(x.shape.type).map(
                                    (x) => [x.value, x.description],
                                ),
                            ),
                        ])
                        .reduce(
                            (acc, [key, value]) => {
                                const values = {
                                    disabled: !$displayHidingZones,
                                    options: value,
                                };

                                if (acc[key]) {
                                    acc[key].options = {
                                        ...acc[key].options,
                                        ...value,
                                    };
                                } else {
                                    acc[key] = values;
                                }

                                return acc;
                            },
                            {} as Record<
                                string,
                                {
                                    disabled: boolean;
                                    options: Record<string, string>;
                                }
                            >,
                        )}
                    value={data.type}
                    onValueChange={async (value) => {
                        if (
                            value === "custom-zone" ||
                            value === "custom-points"
                        ) {
                            if ($customInitPref === "ask") {
                                setPendingCustomType(value);
                                setCustomDialogOpen(true);
                                return;
                            }
                            // Apply preference without dialog
                            if ($customInitPref === "blank") {
                                if (value === "custom-zone") {
                                    (data as any).geo = undefined;
                                    toast.info(
                                        "Please draw the zone on the map.",
                                    );
                                } else {
                                    (data as any).geo = [];
                                    toast.info(
                                        "Please draw the points on the map.",
                                    );
                                }
                            } else if ($customInitPref === "prefill") {
                                if (value === "custom-zone") {
                                    (data as any).geo =
                                        await determineMatchingBoundary(data);
                                } else {
                                    if (
                                        data.type === "airport" ||
                                        data.type === "major-city" ||
                                        data.type === "aquarium-full" ||
                                        data.type === "zoo-full" ||
                                        data.type === "theme_park-full" ||
                                        data.type === "peak-full" ||
                                        data.type === "museum-full" ||
                                        data.type === "hospital-full" ||
                                        data.type === "cinema-full" ||
                                        data.type === "library-full" ||
                                        data.type === "golf_course-full" ||
                                        data.type === "consulate-full" ||
                                        data.type === "park-full"
                                    ) {
                                        (data as any).geo =
                                            await findMatchingPlaces(data);
                                    } else {
                                        (data as any).geo = [];
                                        toast.info(
                                            "Please draw the points on the map.",
                                        );
                                    }
                                }
                            }
                            // The category should be defined such that no error is thrown if this is a zone question.
                            if (!(data as any).cat) {
                                (data as any).cat = { adminLevel: 3 };
                            }
                            questionModified((data.type = value));
                            return;
                        }

                        if (value === "same-length-station") {
                            data.lengthComparison = "same";
                            data.same = true;
                        }

                        // The category should be defined such that no error is thrown if this is a zone question.
                        if (!(data as any).cat) {
                            (data as any).cat = { adminLevel: 3 };
                        }
                        questionModified((data.type = value));
                    }}
                    disabled={!data.drag || $isLoading}
                />
            </SidebarMenuItem>
            {questionSpecific}

            {data.type !== "custom-zone" && (
                <LatitudeLongitude
                    latitude={data.lat}
                    longitude={data.lng}
                    colorName={data.color}
                    onChange={(lat, lng) => {
                        if (lat !== null) {
                            data.lat = lat;
                        }
                        if (lng !== null) {
                            data.lng = lng;
                        }
                        questionModified();
                    }}
                    disabled={!data.drag || $isLoading}
                />
            )}
            {data.type !== "pick-type" && (
                <div
                    className={cn(
                        "flex gap-2 items-center p-2",
                        data.type === "same-length-station" && "flex-col",
                    )}
                >
                    <Label
                        className={cn(
                            "font-semibold text-lg",
                            $isLoading && "text-muted-foreground",
                            data.type === "same-length-station" &&
                                "text-center",
                        )}
                    >
                        Result
                    </Label>
                    {data.type === "same-length-station" ? (
                        <ToggleGroup
                            className="grow"
                            type="single"
                            value={
                                data.lengthComparison
                                    ? data.lengthComparison
                                    : data.same === true
                                      ? "same"
                                      : data.same === false
                                        ? "different"
                                        : "same"
                            }
                            onValueChange={(
                                value:
                                    | "shorter"
                                    | "same"
                                    | "longer"
                                    | "different",
                            ) => {
                                if (value === "shorter" || value === "longer") {
                                    questionModified(
                                        (data.lengthComparison = value),
                                    );
                                } else if (value === "same") {
                                    questionModified(
                                        (data.lengthComparison = "same"),
                                    );
                                    questionModified((data.same = true));
                                } else if (value === "different") {
                                    questionModified((data.same = false));
                                }
                            }}
                            disabled={!!$hiderMode || !data.drag || $isLoading}
                        >
                            <ToggleGroupItem value="shorter">
                                Shorter
                            </ToggleGroupItem>
                            <ToggleGroupItem value="same">Same</ToggleGroupItem>
                            <ToggleGroupItem value="longer">
                                Longer
                            </ToggleGroupItem>
                        </ToggleGroup>
                    ) : (
                        <ToggleGroup
                            className="grow"
                            type="single"
                            value={data.same ? "same" : "different"}
                            onValueChange={(value) => {
                                if (value === "same") {
                                    questionModified((data.same = true));
                                } else if (value === "different") {
                                    questionModified((data.same = false));
                                }
                            }}
                            disabled={!!$hiderMode || !data.drag || $isLoading}
                        >
                            <ToggleGroupItem value="different">
                                Different
                            </ToggleGroupItem>
                            <ToggleGroupItem value="same">Same</ToggleGroupItem>
                        </ToggleGroup>
                    )}
                </div>
            )}
        </QuestionCard>
    );
};
