import { useStore } from "@nanostores/react";
import { toast } from "react-toastify";

import { LatitudeLongitude } from "@/components/LatLngPicker";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import {
    displayHidingZones,
    drawingQuestionKey,
    hiderMode,
    isLoading,
    questionModified,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import { ICON_COLORS } from "@/maps/api";
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
    showDeleteButton = true,
}: {
    data: MatchingQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
    showDeleteButton?: boolean;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const $displayHidingZones = useStore(displayHidingZones);
    const $drawingQuestionKey = useStore(drawingQuestionKey);
    const $isLoading = useStore(isLoading);
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
                            trigger="OSM Zone"
                            options={{
                                3: "OSM Zone 3 (region in Japan)",
                                4: "OSM Zone 4 (prefecture in Japan)",
                                5: "OSM Zone 5",
                                6: "OSM Zone 6",
                                7: "OSM Zone 7",
                                8: "OSM Zone 8",
                                9: "OSM Zone 9",
                                10: "OSM Zone 10",
                            }}
                            value={data.cat.adminLevel.toString()}
                            onValueChange={(value) =>
                                questionModified(
                                    (data.cat.adminLevel = parseInt(value) as
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
                <span className="px-2 text-center text-orange-500">
                    Warning: The train line data is based on OpenStreetMap and
                    may have fewer train stations than expected. If you are
                    using this tool, ensure that the other players are also
                    using this tool.
                </span>
            );
            break;
        case "aquarium":
        case "hospital":
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
                );
            }
    }

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            showDeleteButton={showDeleteButton}
            collapsed={data.collapsed}
            setCollapsed={(collapsed) => {
                data.collapsed = collapsed; // Doesn't trigger a re-render so no need for questionModified
            }}
        >
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
                        if (value === "custom-zone") {
                            (data as any).geo =
                                await determineMatchingBoundary(data);
                        }
                        if (value === "custom-points") {
                            if (
                                data.type === "airport" ||
                                data.type === "major-city" ||
                                data.type === "aquarium-full" ||
                                data.type === "zoo-full" ||
                                data.type === "theme_park-full" ||
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
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <label className="text-2xl font-semibold font-poppins">
                    Same
                </label>
                <Checkbox
                    disabled={!!$hiderMode || !data.drag || $isLoading}
                    checked={data.same}
                    onCheckedChange={(checked) =>
                        questionModified((data.same = checked as boolean))
                    }
                />
            </SidebarMenuItem>
            <SidebarMenuItem
                className={cn(
                    MENU_ITEM_CLASSNAME,
                    "text-2xl font-semibold font-poppins",
                    data.type === "custom-zone" && "capitalize",
                )}
                style={
                    data.type === "custom-zone"
                        ? {}
                        : {
                              backgroundColor: ICON_COLORS[data.color],
                              color:
                                  data.color === "gold" ? "black" : undefined,
                          }
                }
            >
                {data.type !== "custom-zone" && "Color ("} lock{" "}
                <Checkbox
                    checked={!data.drag}
                    disabled={$isLoading}
                    onCheckedChange={(checked) =>
                        questionModified((data.drag = !checked as boolean))
                    }
                />
                {data.type !== "custom-zone" && ")"}
            </SidebarMenuItem>
            {data.type !== "custom-zone" && (
                <LatitudeLongitude
                    latitude={data.lat}
                    longitude={data.lng}
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
        </QuestionCard>
    );
};
