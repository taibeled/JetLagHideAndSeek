import { LatitudeLongitude } from "../LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import {
    displayHidingZones,
    drawingQuestionKey,
    hiderMode,
    isLoading,
    questionModified,
    questions,
    triggerLocalRefresh,
} from "../../lib/context";
import { iconColors, prettifyLocation } from "../../maps/api";
import type { MatchingQuestion, TentacleLocations } from "../../lib/schema";
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
import { determineMatchingBoundary, findMatchingPlaces } from "@/maps/matching";
import { toast } from "react-toastify";

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
                            value={data.cat.adminLevel.toString()}
                            onValueChange={(value) =>
                                questionModified(
                                    (data.cat.adminLevel = parseInt(
                                        value as string,
                                    ) as 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10),
                                )
                            }
                            disabled={!data.drag || $isLoading}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="OSM Zone" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="3">
                                    OSM Zone 3 (region in Japan)
                                </SelectItem>
                                <SelectItem value="4">
                                    OSM Zone 4 (prefecture in Japan)
                                </SelectItem>
                                <SelectItem value="5">OSM Zone 5</SelectItem>
                                <SelectItem value="6">OSM Zone 6</SelectItem>
                                <SelectItem value="7">OSM Zone 7</SelectItem>
                                <SelectItem value="8">OSM Zone 8</SelectItem>
                                <SelectItem value="9">OSM Zone 9</SelectItem>
                                <SelectItem value="10">OSM Zone 10</SelectItem>
                            </SelectContent>
                        </Select>
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
        >
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Select
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
                        questionModified((data.type = value as any));
                    }}
                    disabled={!data.drag || $isLoading}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Matching Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="zone">Zone Question</SelectItem>
                        <SelectItem value="letter-zone">
                            Zone Starts With Same Letter Question
                        </SelectItem>
                        <SelectItem value="custom-zone">
                            Custom Zone Question
                        </SelectItem>
                        <SelectItem value="airport">
                            Closest Commercial Airport In Zone Question
                        </SelectItem>
                        <SelectItem value="major-city">
                            Closest Major City (1,000,000+ people) In Zone
                            Question
                        </SelectItem>
                        <SelectItem value="custom-points">
                            Custom Points Question
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
                        <SelectGroup>
                            <SelectLabel>Hiding Zone Mode</SelectLabel>
                            <SelectItem
                                value="same-first-letter-station"
                                disabled={!$displayHidingZones}
                            >
                                Station Starts With Same Letter Question
                            </SelectItem>
                            <SelectItem
                                value="same-length-station"
                                disabled={!$displayHidingZones}
                            >
                                Station Has Same Length Question
                            </SelectItem>
                            <SelectItem
                                value="same-train-line"
                                disabled={!$displayHidingZones}
                            >
                                Station On Same Train Line Question
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
                              backgroundColor: iconColors[data.color],
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
