import { LatitudeLongitude } from "../LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import {
    displayHidingZones,
    drawingQuestionKey,
    hiderMode,
    questionModified,
    questions,
    triggerLocalRefresh,
    isLoading,
} from "../../lib/context";
import { iconColors, prettifyLocation } from "../../maps/api";
import { MENU_ITEM_CLASSNAME, SidebarMenuItem } from "../ui/sidebar-l";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { QuestionCard } from "./base";
import type { MeasuringQuestion, TentacleLocations } from "@/lib/schema";
import { determineMeasuringBoundary } from "@/maps/measuring";

export const MeasuringQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
    showDeleteButton = true,
}: {
    data: MeasuringQuestion;
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
    const label = `Measuring
    ${
        $questions
            .filter((q) => q.id === "measuring")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    let questionSpecific = <></>;

    switch (data.type) {
        case "mcdonalds":
        case "seven11":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    This question will eliminate hiding zones that don&apos;t
                    fit the criteria. When you click on a zone, the parts of
                    that zone that don&apos;t satisfy the criteria will be
                    eliminated.
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
        case "custom-measure":
            if (data.drag) {
                questionSpecific = (
                    <p className="px-2 mb-1 text-center text-orange-500">
                        To modify the measuring question, enable it:
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
                            disabled={!data.drag || $isLoading}
                        />
                        and use the buttons at the bottom left of the map.
                    </p>
                );
            }
            break;
    }

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            showDeleteButton={showDeleteButton}
        >
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Select
                    value={data.type}
                    onValueChange={async (value) => {
                        if (value === "custom-measure") {
                            const boundary =
                                await determineMeasuringBoundary(data);

                            if (!(data as any).geo) {
                                (data as any).geo = {
                                    type: "FeatureCollection",
                                    features: [],
                                };
                            }

                            (data as any).geo.features = boundary
                                ? boundary
                                : [];
                        }
                        data.type = value as any;
                        questionModified();
                    }}
                    disabled={!data.drag || $isLoading}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Measuring Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="coastline">
                            Coastline Question
                        </SelectItem>
                        <SelectItem value="airport">
                            Commercial Airport In Zone Question
                        </SelectItem>
                        <SelectItem value="city">
                            Major City (1,000,000+ people) Question
                        </SelectItem>
                        <SelectItem value="highspeed-measure-shinkansen">
                            High-Speed Rail Question
                        </SelectItem>
                        {(
                            [
                                "aquarium",
                                "zoo",
                                "theme_park",
                                "museum",
                                "hospital",
                                "cinema",
                                "library",
                                "golf_course",
                                "consulate",
                                "park",
                            ] as TentacleLocations[]
                        ).map((location) => (
                            <SelectItem
                                value={location + "-full"}
                                key={location + "-full"}
                            >
                                {prettifyLocation(location)} Question
                                (Small+Medium Games)
                            </SelectItem>
                        ))}
                        <SelectItem value="custom-measure">
                            Custom Measuring Question
                        </SelectItem>
                        <SelectGroup>
                            <SelectLabel>Hiding Zone Mode</SelectLabel>
                            <SelectItem
                                value="mcdonalds"
                                disabled={!$displayHidingZones}
                            >
                                McDonald&apos;s Question
                            </SelectItem>
                            <SelectItem
                                value="seven11"
                                disabled={!$displayHidingZones}
                            >
                                7-Eleven Question
                            </SelectItem>
                            <SelectItem
                                value="rail-measure"
                                disabled={!$displayHidingZones}
                            >
                                Train Station Question
                            </SelectItem>
                            {(
                                [
                                    "aquarium",
                                    "zoo",
                                    "theme_park",
                                    "museum",
                                    "hospital",
                                    "cinema",
                                    "library",
                                    "golf_course",
                                    "consulate",
                                    "park",
                                ] as TentacleLocations[]
                            ).map((location) => (
                                <SelectItem
                                    value={location}
                                    key={location}
                                    disabled={!$displayHidingZones}
                                >
                                    {prettifyLocation(location)} Question (Large
                                    Game)
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </SidebarMenuItem>
            {questionSpecific}
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <label className="text-2xl font-semibold font-poppins">
                    Hider Closer
                </label>
                <Checkbox
                    disabled={!!$hiderMode || !data.drag || $isLoading}
                    checked={data.hiderCloser}
                    onCheckedChange={(checked) =>
                        questionModified(
                            (data.hiderCloser = checked as boolean),
                        )
                    }
                />
            </SidebarMenuItem>
            <SidebarMenuItem
                className={cn(
                    MENU_ITEM_CLASSNAME,
                    "text-2xl font-semibold font-poppins",
                )}
                style={{
                    backgroundColor: iconColors[data.color],
                    color: data.color === "gold" ? "black" : undefined,
                }}
            >
                Color (lock{" "}
                <Checkbox
                    checked={!data.drag}
                    disabled={$isLoading}
                    onCheckedChange={(checked) =>
                        questionModified((data.drag = !checked as boolean))
                    }
                />
                )
            </SidebarMenuItem>
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
        </QuestionCard>
    );
};
