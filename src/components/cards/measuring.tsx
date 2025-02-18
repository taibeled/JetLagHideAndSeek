import { LatitudeLongitude } from "../LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import {
    displayHidingZones,
    hiderMode,
    questions,
    triggerLocalRefresh,
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

export const MeasuringQuestionComponent = ({
    data,
    questionKey,
    index,
    sub,
    className,
    showDeleteButton = true,
}: {
    data: MeasuringQuestion;
    questionKey: number;
    index: number;
    sub?: string;
    className?: string;
    showDeleteButton?: boolean;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const $displayHidingZones = useStore(displayHidingZones);
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
                    onValueChange={(value) => {
                        const newQuestions = [...$questions];
                        (newQuestions[index].data as typeof data).type =
                            value as any;
                        questions.set(newQuestions);
                    }}
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
                                    {prettifyLocation(location)} Question
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
                    disabled={!!$hiderMode}
                    checked={data.hiderCloser}
                    onCheckedChange={(checked) => {
                        const newQuestions = [...$questions];
                        (newQuestions[index].data as typeof data).hiderCloser =
                            (checked ?? false) as boolean;
                        questions.set(newQuestions);
                    }}
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
                Color (drag{" "}
                <Checkbox
                    checked={data.drag}
                    onCheckedChange={(checked) => {
                        const newQuestions = [...$questions];
                        newQuestions[index].data.drag = (checked ??
                            false) as boolean;
                        questions.set(newQuestions);
                    }}
                />
                )
            </SidebarMenuItem>
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                onChange={(lat, lng) => {
                    const newQuestions = [...$questions];
                    if (lat !== null) {
                        (newQuestions[index].data as typeof data).lat = lat;
                    }
                    if (lng !== null) {
                        (newQuestions[index].data as typeof data).lng = lng;
                    }
                    questions.set(newQuestions);
                }}
            />
        </QuestionCard>
    );
};
