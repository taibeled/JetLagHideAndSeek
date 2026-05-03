import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import type { Feature, Point } from "geojson";
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
    playAreaMode,
    questionModified,
    questions,
    trainStations,
    triggerLocalRefresh,
} from "@/lib/context";
import {
    matchingNearestPoiCategory,
    type NearestPoiResult,
    resolveMatchingNearestPoi,
} from "@/lib/nearestPoi";
import { PLAY_AREA_MODES } from "@/lib/playAreaModes";
import { cn } from "@/lib/utils";
import {
    fetchStationTrainLineOptions,
    findNodesOnTrainLine,
    trainLineNodeFinder,
} from "@/maps/api";
import { extractStationLabel } from "@/maps/geo-utils";
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
import { NearestPoiRow } from "./NearestPoiInfo";

const AUTO_TRAIN_LINE = "__auto__";
const AUTO_TRAIN_LINE_LABEL = "(auto-detect from nearest station)";

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
    const $playAreaMode = useStore(playAreaMode);
    const modeConfig = PLAY_AREA_MODES[$playAreaMode];

    const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
    const [pendingCustomType, setPendingCustomType] = React.useState<
        "custom-zone" | "custom-points" | null
    >(null);
    const [nearestPoi, setNearestPoi] = React.useState<
        NearestPoiResult | { status: "loading"; category: string }
    >({ status: "unsupported" });
    const [lineOptions, setLineOptions] = React.useState<
        Record<string, string>
    >({
        [AUTO_TRAIN_LINE]: AUTO_TRAIN_LINE_LABEL,
    });
    const [loadingLineOptions, setLoadingLineOptions] = React.useState(false);
    const [lineStationPreview, setLineStationPreview] = React.useState<
        string[]
    >([]);
    const [loadingLineStationPreview, setLoadingLineStationPreview] =
        React.useState(false);
    const stationPoints = React.useMemo(
        () => $trainStations.map((station) => station.properties),
        [$trainStations],
    );
    const nearestTrainStation = React.useMemo(() => {
        if (data.type !== "same-train-line" || stationPoints.length === 0) {
            return null;
        }

        return turf.nearestPoint(
            turf.point([data.lng, data.lat]),
            turf.featureCollection(stationPoints),
        ) as Feature<Point>;
    }, [data.lat, data.lng, data.type, stationPoints]);
    const nearestTrainStationId =
        typeof nearestTrainStation?.properties?.id === "string"
            ? nearestTrainStation.properties.id
            : undefined;
    const selectedTrainLineId =
        data.type === "same-train-line" ? data.selectedTrainLineId : undefined;
    const nearestPoiKey = JSON.stringify({
        type: data.type,
        lat: data.lat,
        lng: data.lng,
        geo: data.type === "custom-points" ? data.geo : undefined,
        stations:
            data.type === "same-first-letter-station" ||
            data.type === "same-length-station" ||
            data.type === "same-train-line"
                ? stationPoints.map((station) => ({
                      label: extractStationLabel(
                          station,
                          modeConfig.stationNameStrategy,
                      ),
                      coordinates: station.geometry.coordinates,
                  }))
                : undefined,
    });
    const label = `Matching
    ${
        $questions
            .filter((q) => q.id === "matching")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    let questionSpecific = <></>;

    React.useEffect(() => {
        const category = matchingNearestPoiCategory(data.type);
        if (!category) {
            setNearestPoi({ status: "unsupported" });
            return;
        }

        let cancelled = false;
        setNearestPoi({ status: "loading", category });

        resolveMatchingNearestPoi(data, stationPoints).then((result) => {
            if (!cancelled) {
                setNearestPoi(result);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [nearestPoiKey]);

    React.useEffect(() => {
        if (data.type !== "zone" && data.type !== "letter-zone") return;
        const validLevels = modeConfig.matchingZoneLevels.map(
            (l) => l.adminLevel,
        );
        if (!validLevels.includes(data.cat.adminLevel)) {
            data.cat.adminLevel = modeConfig.defaultMatchingAdminLevel;
            questionModified();
        }
    }, [$playAreaMode, data.type]);

    React.useEffect(() => {
        if (data.type !== "same-train-line") return;

        let cancelled = false;
        const autoOptions = {
            [AUTO_TRAIN_LINE]: AUTO_TRAIN_LINE_LABEL,
        };

        if (!nearestTrainStationId?.startsWith("node/")) {
            setLineOptions(autoOptions);
            setLoadingLineOptions(false);
            if (data.selectedTrainLineId) {
                data.selectedTrainLineId = undefined;
                data.selectedTrainLineLabel = undefined;
                questionModified();
            }
            return;
        }

        setLoadingLineOptions(true);
        fetchStationTrainLineOptions(nearestTrainStationId)
            .then((options) => {
                if (cancelled) return;

                const nextOptions = {
                    ...autoOptions,
                    ...Object.fromEntries(
                        options.map((option) => [option.id, option.label]),
                    ),
                };
                setLineOptions(nextOptions);

                if (
                    data.selectedTrainLineId &&
                    !nextOptions[data.selectedTrainLineId]
                ) {
                    data.selectedTrainLineId = undefined;
                    data.selectedTrainLineLabel = undefined;
                    questionModified();
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingLineOptions(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [data.type, nearestTrainStationId]);

    React.useEffect(() => {
        if (data.type !== "same-train-line") return;

        let cancelled = false;

        const stationLabelByNodeId = new Map<number, string>();
        for (const station of stationPoints) {
            const stationId = station.properties?.id;
            if (!stationId?.startsWith("node/")) continue;

            const nodeId = Number(stationId.split("/")[1]);
            if (!Number.isFinite(nodeId)) continue;

            stationLabelByNodeId.set(
                nodeId,
                extractStationLabel(station, modeConfig.stationNameStrategy),
            );
        }

        if (
            stationLabelByNodeId.size === 0 ||
            (!selectedTrainLineId &&
                !nearestTrainStationId?.startsWith("node/"))
        ) {
            setLineStationPreview([]);
            setLoadingLineStationPreview(false);
            return;
        }

        setLoadingLineStationPreview(true);
        const nodesPromise = selectedTrainLineId
            ? findNodesOnTrainLine(selectedTrainLineId)
            : trainLineNodeFinder(nearestTrainStationId!);

        nodesPromise
            .then((nodes) => {
                if (cancelled) return;

                const matchedLabels = Array.from(new Set(nodes))
                    .flatMap((nodeId) => {
                        const label = stationLabelByNodeId.get(nodeId);
                        return label ? [label] : [];
                    })
                    .sort((a, b) =>
                        a.localeCompare(b, undefined, {
                            numeric: true,
                            sensitivity: "base",
                        }),
                    );
                setLineStationPreview(matchedLabels);
            })
            .catch(() => {
                if (!cancelled) {
                    setLineStationPreview([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingLineStationPreview(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [
        data.type,
        modeConfig.stationNameStrategy,
        nearestTrainStationId,
        selectedTrainLineId,
        stationPoints,
    ]);

    switch (data.type) {
        case "zone":
        case "letter-zone":
            questionSpecific = (
                <>
                    <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                        <Select
                            trigger="OSM Zone"
                            options={Object.fromEntries(
                                modeConfig.matchingZoneLevels.map((l) => [
                                    l.adminLevel.toString(),
                                    l.label,
                                ]),
                            )}
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
        case "same-train-line":
            questionSpecific = (
                <>
                    <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                        <Select
                            trigger={
                                loadingLineOptions
                                    ? "Loading train lines..."
                                    : (data.selectedTrainLineLabel ??
                                      "Train line")
                            }
                            options={lineOptions}
                            value={data.selectedTrainLineId ?? AUTO_TRAIN_LINE}
                            onValueChange={(value) => {
                                if (value === AUTO_TRAIN_LINE) {
                                    data.selectedTrainLineId = undefined;
                                    data.selectedTrainLineLabel = undefined;
                                } else {
                                    data.selectedTrainLineId = value;
                                    data.selectedTrainLineLabel =
                                        lineOptions[value];
                                }
                                questionModified();
                            }}
                            disabled={
                                !data.drag || $isLoading || loadingLineOptions
                            }
                        />
                    </SidebarMenuItem>
                    <div className="px-2 text-xs">
                        <div className="font-medium">
                            {loadingLineStationPreview
                                ? "Loading stations..."
                                : `Stations matched: ${lineStationPreview.length}`}
                        </div>
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-md border p-2">
                            {lineStationPreview.length === 0 &&
                            !loadingLineStationPreview ? (
                                <span className="text-muted-foreground">
                                    No stations found for this line
                                </span>
                            ) : (
                                lineStationPreview.map((name, index) => (
                                    <div key={`${name}-${index}`}>{name}</div>
                                ))
                            )}
                        </div>
                    </div>
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
                                (data as any).cat = {
                                    adminLevel:
                                        modeConfig.defaultMatchingAdminLevel,
                                };
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
                            (data as any).cat = {
                                adminLevel:
                                    modeConfig.defaultMatchingAdminLevel,
                            };
                        }
                        questionModified((data.type = value));
                    }}
                    disabled={!data.drag || $isLoading}
                />
            </SidebarMenuItem>
            {questionSpecific}

            {data.type !== "custom-zone" && (
                <>
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
                    <NearestPoiRow nearestPoi={nearestPoi} />
                </>
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
                        <ToggleGroupItem value="longer">Longer</ToggleGroupItem>
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
        </QuestionCard>
    );
};
