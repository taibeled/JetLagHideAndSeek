import { LatitudeLongitude } from "../LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import {
    displayHidingZones,
    hiderMode,
    questions,
    triggerLocalRefresh,
} from "../../lib/context";
import { iconColors } from "../../maps/api";
import type { MatchingQuestion } from "../../maps/matching";
import { MENU_ITEM_CLASSNAME, SidebarMenuItem } from "../ui/sidebar-l";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { QuestionCard } from "./base";

export const MatchingQuestionComponent = ({
    data,
    questionKey,
    index,
    sub,
    className,
    showDeleteButton = true,
}: {
    data: MatchingQuestion;
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
                            onValueChange={(value) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as typeof data
                                ).cat.adminLevel = parseInt(value) as any;
                                questions.set(newQuestions);
                            }}
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
                        <SelectValue placeholder="Matching Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="zone">Zone Question</SelectItem>
                        <SelectItem value="letter-zone">
                            Zone Starts With Same Letter Question
                        </SelectItem>
                        <SelectItem value="airport">
                            Closest Commercial Airport In Zone Question
                        </SelectItem>
                        <SelectItem value="major-city">
                            Closest Major City (1,000,000+ people) In Zone
                            Question
                        </SelectItem>
                        <SelectItem
                            value="same-first-letter-station"
                            disabled={!$displayHidingZones}
                        >
                            Station Starts With Same Letter Question (must be in
                            hiding zone mode)
                        </SelectItem>
                        <SelectItem
                            value="same-length-station"
                            disabled={!$displayHidingZones}
                        >
                            Station Has Same Length Question (must be in hiding
                            zone mode)
                        </SelectItem>
                        <SelectItem
                            value="same-train-line"
                            disabled={!$displayHidingZones}
                        >
                            Station On Same Train Line Question (must be in
                            hiding zone mode)
                        </SelectItem>
                    </SelectContent>
                </Select>
            </SidebarMenuItem>
            {questionSpecific}
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <label className="text-2xl font-semibold font-poppins">
                    Same
                </label>
                <Checkbox
                    disabled={!!$hiderMode}
                    checked={data.same}
                    onCheckedChange={(checked) => {
                        const newQuestions = [...$questions];
                        (newQuestions[index].data as typeof data).same =
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
                    backgroundColor: iconColors[data.color ?? "gold"],
                    color:
                        (data.color ?? "gold") === "gold" ? "black" : undefined,
                }}
            >
                Color (drag{" "}
                <Checkbox
                    checked={data.drag ?? false}
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
