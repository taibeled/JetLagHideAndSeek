import { useStore } from "@nanostores/react";
import * as React from "react";
import { toast } from "react-toastify";

import CustomInitDialog from "@/components/CustomInitDialog";
import { LatitudeLongitude } from "@/components/LatLngPicker";
import PresetsDialog from "@/components/PresetsDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    customInitPreference,
    displayHidingZones,
    drawingQuestionKey,
    hiderMode,
    isLoading,
    questionModified,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import { nearestSydneyStationLineContext } from "@/maps/api";
import {
    determineMatchingBoundary,
    findMatchingPlaces,
} from "@/maps/questions/matching";
import {
    determineUnionizedStrings,
    type MatchingQuestion,
    matchingQuestionSchema,
    NO_GROUP,
} from "@/maps/schema";

import { QuestionCard } from "./base";
import { QuestionDebugDetails } from "./debug";

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
    const SYDNEY_LINE_LABELS: Record<string, string> = {
        L1: "L1 Dulwich Hill",
        L2: "L2 Randwick",
        L3: "L3 Kingsford",
        L4: "L4 Westmead & Carlingford",
        M1: "M1 Metro North West & Bankstown",
        T1: "T1 North Shore & Western",
        T2: "T2 Inner West & Leppington",
        T3: "T3 Liverpool & Inner West",
        T4: "T4 Eastern Suburbs & Illawarra",
        T5: "T5 Cumberland",
        T8: "T8 Airport & South",
        T9: "T9 Northern",
    };

    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const $displayHidingZones = useStore(displayHidingZones);
    const $drawingQuestionKey = useStore(drawingQuestionKey);
    const $isLoading = useStore(isLoading);
    const $customInitPref = useStore(customInitPreference);
    const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
    const [pendingCustomType, setPendingCustomType] = React.useState<
        "custom-zone" | "custom-points" | null
    >(null);
    const [trainLineContextLoading, setTrainLineContextLoading] =
        React.useState(false);

    const modifyQuestion = (...args: Parameters<typeof questionModified>) => {
        if ((data as any).autoFrozen) {
            (data as any).autoFrozen = false;
        }
        questionModified(...args);
    };

    const syncMatchingDebugResult = (result: string) => {
        if ((data as any).debug && typeof (data as any).debug === "object") {
            (data as any).debug = {
                ...(data as any).debug,
                detectedResult: result,
            };
        }

        if (data.matchingDebug && typeof data.matchingDebug === "object") {
            data.matchingDebug = {
                ...(data.matchingDebug as Record<string, unknown>),
                same: result === "same",
            } as any;
        }
    };
    const label = `Matching
    ${
        $questions
            .filter((q) => q.id === "matching")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    React.useEffect(() => {
        let cancelled = false;

        if (data.type !== "same-train-line") {
            setTrainLineContextLoading(false);
            return;
        }

        setTrainLineContextLoading(true);

        nearestSydneyStationLineContext(data.lat, data.lng)
            .then((context) => {
                if (cancelled) return;

                setTrainLineContextLoading(false);

                if (!context) return;

                const nextOptions = context.lines;
                const currentOptions = data.sydneyLineOptions ?? [];
                const selectedLine = data.selectedSydneyTrainLine ?? "AUTO";

                const optionsChanged =
                    JSON.stringify(currentOptions) !==
                    JSON.stringify(nextOptions);
                const stationChanged =
                    data.sydneyLineStationName !== context.stationName;
                const manualChanged =
                    data.sydneyLineManualRequired !==
                    context.requiresManualSelection;

                if (!optionsChanged && !stationChanged && !manualChanged) {
                    return;
                }

                data.sydneyLineOptions = nextOptions;
                data.sydneyLineStationName = context.stationName;
                data.sydneyLineManualRequired =
                    context.requiresManualSelection;

                if (context.requiresManualSelection) {
                    if (!nextOptions.includes(selectedLine)) {
                        data.selectedSydneyTrainLine = "UNSET";
                    }
                } else if (
                    selectedLine !== "AUTO" &&
                    !nextOptions.includes(selectedLine)
                ) {
                    data.selectedSydneyTrainLine = "AUTO";
                }

                questionModified();
            })
            .catch(() => {
                if (cancelled) return;
                setTrainLineContextLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [data.type, data.lat, data.lng]);

    let questionSpecific = <></>;

    switch (data.type) {
        case "zone":
        case "letter-zone":
            questionSpecific = (
                <>
                    <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                        <Select
                            trigger="OSM Zone"
                            options={{
                                2: "OSM Zone 2 (Country)",
                                3: "OSM Zone 3 (region in Japan)",
                                4: "OSM Zone 4 (prefecture in Japan)",
                                5: "OSM Zone 5",
                                6: "OSM Zone 6 (Local Government Area - Sydney)",
                                7: "OSM Zone 7",
                                8: "OSM Zone 8",
                                9: "OSM Zone 9 (Suburb in Sydney)",
                                10: "OSM Zone 10",
                            }}
                            value={data.cat.adminLevel.toString()}
                            onValueChange={(value) => {
                                data.cat.adminLevel = parseInt(value) as
                                    | 2
                                    | 3
                                    | 4
                                    | 5
                                    | 6
                                    | 7
                                    | 8
                                    | 9
                                    | 10;
                                modifyQuestion();
                            }}
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
        case "suburb-zone":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    This question uses suburb boundaries (OSM admin level 9).
                </span>
            );
            break;
        case "federal-electorate-zone":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    This question uses federal electorate boundaries (OSM admin
                    level 6).
                </span>
            );
            break;
        case "same-nearest-mcdonalds":
        case "same-nearest-synagogue":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    In hider mode, this is auto-answered by comparing the
                    nearest location to both players.
                </span>
            );
            break;
        case "same-train-line":
            const lineOptions = data.sydneyLineOptions ?? [];
            const manualRequired = !!data.sydneyLineManualRequired;
            const selectableLineOptions = manualRequired
                ? ["UNSET", ...lineOptions]
                : ["AUTO", ...lineOptions];
            const safeSelectedLine = selectableLineOptions.includes(
                data.selectedSydneyTrainLine,
            )
                ? data.selectedSydneyTrainLine
                : selectableLineOptions[0] ?? "AUTO";

            questionSpecific = (
                <>
                    <span className="px-2 text-center text-orange-500">
                        Sydney mode: this checks L1-L4 Light Rail, M1 Metro,
                        and T1-T5/T8-T9 Train lines.
                    </span>
                    <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                        <Select
                            trigger={
                                manualRequired
                                    ? "Select Platform Line (Required)"
                                    : "Preferred Platform Line"
                            }
                            options={Object.fromEntries(
                                selectableLineOptions.map((line) => [
                                    line,
                                    line === "AUTO"
                                        ? "Auto-detect"
                                        : line === "UNSET"
                                          ? "Select platform line"
                                          : (SYDNEY_LINE_LABELS[line] ?? line),
                                ]),
                            )}
                            value={safeSelectedLine}
                            onValueChange={(value) =>
                                modifyQuestion(
                                    (data.selectedSydneyTrainLine = value),
                                )
                            }
                            disabled={
                                !data.drag ||
                                $isLoading ||
                                trainLineContextLoading ||
                                selectableLineOptions.length === 0
                            }
                        />
                    </SidebarMenuItem>
                    {manualRequired && (
                        <span className="px-2 text-center text-orange-500">
                            Multiple Sydney lines detected at
                            {" " +
                                (data.sydneyLineStationName || "this station")}
                            . Pick the platform line you are currently on.
                        </span>
                    )}
                    {data.sydneyLineDebug && (
                        <div className="px-2 text-xs text-muted-foreground">
                            <div>
                                Your nearest station: {data.sydneyLineDebug.seekerStationName || "Unknown"}
                            </div>
                            <div>
                                Lines at your station: {(data.sydneyLineDebug.seekerLines || []).join(", ") || "None"}
                            </div>
                            {$hiderMode !== false && (
                                <>
                                    <div>
                                        Hider nearest station: {data.sydneyLineDebug.hiderStationName || "Unknown"}
                                    </div>
                                    <div>
                                        Lines at hider station: {(data.sydneyLineDebug.hiderLines || []).join(", ") || "None"}
                                    </div>
                                </>
                            )}
                            <div>
                                Active line selection: {data.sydneyLineDebug.selectedLine || "AUTO"}
                            </div>
                            <div>
                                Compared lines: {(data.sydneyLineDebug.effectiveSeekerLines || []).join(", ") || "None"}
                            </div>
                            <div>
                                Stations found on selected line(s): {data.sydneyLineDebug.stationCountOnActiveLines ?? 0}
                            </div>
                            <div>
                                This compares full train lines across the network, not only one station.
                            </div>
                        </div>
                    )}
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
            setLocked={(locked) => modifyQuestion((data.drag = !locked))}
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
                    modifyQuestion();
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
                    modifyQuestion();
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
                            .map((x) => [(x._def as any).value, x.description]),
                    )}
                    groups={matchingQuestionSchema.options
                        .filter((x) => x.description !== NO_GROUP)
                        .map((x) => [
                            x.description,
                            Object.fromEntries(
                                determineUnionizedStrings(x.shape.type).map(
                                    (x) => [
                                        (x._def as any).value,
                                        x.description,
                                    ],
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
                            data.type = value;
                            modifyQuestion();
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
                        data.type = value;
                        modifyQuestion();
                    }}
                    disabled={!data.drag || $isLoading}
                />
            </SidebarMenuItem>
            {questionSpecific}

            <QuestionDebugDetails
                debug={
                    data.type === "same-train-line"
                        ? undefined
                        : (data as any).debug
                }
                title="Detection Debug"
                showHider={$hiderMode !== false}
            />

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
                        modifyQuestion();
                    }}
                    disabled={!data.drag || $isLoading}
                />
            )}
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
                        data.type === "same-length-station" && "text-center",
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
                            value: "shorter" | "same" | "longer" | "different",
                        ) => {
                            if (value === "shorter" || value === "longer") {
                                modifyQuestion(
                                    (data.lengthComparison = value),
                                );
                                syncMatchingDebugResult(value);
                            } else if (value === "same") {
                                modifyQuestion(
                                    (data.lengthComparison = "same"),
                                );
                                modifyQuestion((data.same = true));
                                syncMatchingDebugResult("same");
                            } else if (value === "different") {
                                modifyQuestion((data.same = false));
                                syncMatchingDebugResult("different");
                            }
                        }}
                        disabled={!!$hiderMode || !data.drag || $isLoading}
                    >
                        <ToggleGroupItem value="shorter">
                            Shorter
                        </ToggleGroupItem>
                        <ToggleGroupItem value="same">Same</ToggleGroupItem>
                        <ToggleGroupItem value="longer">Longer</ToggleGroupItem>
                    </ToggleGroup>
                ) : (
                    <ToggleGroup
                        className="grow"
                        type="single"
                        value={data.same ? "same" : "different"}
                        onValueChange={(value) => {
                            if (value === "same") {
                                modifyQuestion((data.same = true));
                                syncMatchingDebugResult("same");
                            } else if (value === "different") {
                                modifyQuestion((data.same = false));
                                syncMatchingDebugResult("different");
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
        </QuestionCard>
    );
};
