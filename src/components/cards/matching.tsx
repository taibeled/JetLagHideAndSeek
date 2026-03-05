import { useStore } from "@nanostores/react";
import { ChevronsLeftRight, Equal, Shuffle } from "lucide-react";
import * as React from "react";
import { toast } from "react-toastify";
import { useT } from "@/i18n";

import CustomInitDialog from "@/components/CustomInitDialog";
import { LatitudeLongitude } from "@/components/LatLngPicker";
import PresetsDialog from "@/components/PresetsDialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import { gameSize } from "@/lib/session-context";
import { cn } from "@/lib/utils";
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

export const MatchingQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
    embedded = false,
}: {
    data: MatchingQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
    embedded?: boolean;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const $displayHidingZones = useStore(displayHidingZones);
    const $drawingQuestionKey = useStore(drawingQuestionKey);
    const $isLoading = useStore(isLoading);
    const $customInitPref = useStore(customInitPreference);
    const $gameSize = useStore(gameSize);
    const tr = useT();
    const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
    const [pendingCustomType, setPendingCustomType] = React.useState<
        "custom-zone" | "custom-points" | null
    >(null);
    const label = `Matching
    ${
        $questions
            .filter((q) => q.id === "matching")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    let questionSpecific = <></>;

    switch (data.type) {
        case "zone":
        case "letter-zone":
            questionSpecific = (
                <>
                    <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                        <Select
                            trigger={tr("matching.osmZone")}
                            options={{
                                2: tr("osmZone.2"),
                                3: tr("osmZone.3"),
                                4: tr("osmZone.4"),
                                5: tr("osmZone.5"),
                                6: tr("osmZone.6"),
                                7: tr("osmZone.7"),
                                8: tr("osmZone.8"),
                                9: tr("osmZone.9"),
                                10: tr("osmZone.10"),
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
                            {tr("matching.warningLetterZone")}
                        </span>
                    )}
                </>
            );
            break;
        case "same-train-line":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    {tr("matching.warningSameTrainLine")}
                </span>
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
                    {tr("matching.clickOnZone")}
                </span>
            );
            break;
        case "custom-zone":
        case "custom-points":
            if (data.drag) {
                questionSpecific = (
                    <>
                        <p className="px-2 mb-1 text-center text-orange-500">
                            {data.type === "custom-zone"
                                ? tr("matching.modifyZoneInstructions")
                                : tr("matching.modifyPointsInstructions")}
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
                            {tr("matching.useMapButtons")}
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
            embedded={embedded}
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
                            .filter((x) =>
                                // Hide "(Small+Medium Games)" sub-types when playing Large
                                !($gameSize === "L" && x.description?.includes("(Small+Medium Games)")),
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
                    compact={embedded}
                />
            )}
            <div className="flex gap-2 items-center p-2">
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
                        <ToggleGroupItem value="shorter" title="Shorter" className="flex items-center justify-center">
                            <ChevronsLeftRight className="h-5 w-5 scale-x-50" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="same" title="Same" className="flex items-center justify-center">
                            <Equal className="h-5 w-5" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="longer" title="Longer" className="flex items-center justify-center">
                            <ChevronsLeftRight className="h-5 w-5" />
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
                        <ToggleGroupItem value="different" title="Different" className="flex items-center justify-center">
                            <Shuffle className="h-5 w-5" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="same" title="Same" className="flex items-center justify-center">
                            <Equal className="h-5 w-5" />
                        </ToggleGroupItem>
                    </ToggleGroup>
                )}
            </div>
        </QuestionCard>
    );
};
