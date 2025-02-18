import { Suspense, use } from "react";
import { LatitudeLongitude } from "../LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import { hiderMode, questions, triggerLocalRefresh } from "../../lib/context";
import { findTentacleLocations, iconColors } from "../../maps/api";
import { MENU_ITEM_CLASSNAME, SidebarMenuItem } from "../ui/sidebar-l";
import { Input } from "../ui/input";
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
import type { TentacleQuestion } from "@/lib/schema";

export const TentacleQuestionComponent = ({
    data,
    questionKey,
    index,
    sub,
    className,
    showDeleteButton = true,
}: {
    data: TentacleQuestion;
    questionKey: number;
    index: number;
    sub?: string;
    className?: string;
    showDeleteButton?: boolean;
}) => {
    const $questions = useStore(questions);
    const label = `Tentacles
    ${
        $questions
            .filter((q) => q.id === "tentacles")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            showDeleteButton={showDeleteButton}
        >
            <SidebarMenuItem>
                <div className={cn(MENU_ITEM_CLASSNAME, "gap-2 flex flex-row")}>
                    <Input
                        type="number"
                        className="rounded-md p-2 w-16"
                        value={data.radius}
                        onChange={(e) => {
                            const newQuestions = [...$questions];
                            (newQuestions[index].data as typeof data).radius =
                                parseFloat(e.target.value);
                            questions.set(newQuestions);
                        }}
                    />
                    <Select
                        value={data.unit}
                        onValueChange={(value) => {
                            const newQuestions = [...$questions];
                            (newQuestions[index].data as typeof data).unit =
                                value as any;
                            questions.set(newQuestions);
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="miles">Miles</SelectItem>
                            <SelectItem value="kilometers">
                                Kilometers
                            </SelectItem>
                            <SelectItem value="meters">Meters</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </SidebarMenuItem>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Select
                    value={data.locationType}
                    onValueChange={(value) => {
                        const newQuestions = [...$questions];
                        (newQuestions[index].data as typeof data).locationType =
                            value as any;
                        questions.set(newQuestions);
                    }}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Location Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectLabel>15 Miles (Typically)</SelectLabel>
                            <SelectItem value="theme_park">
                                Theme Parks
                            </SelectItem>
                            <SelectItem value="zoo">Zoos</SelectItem>
                            <SelectItem value="aquarium">Aquariums</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                            <SelectLabel>1 Mile (Typically)</SelectLabel>
                            <SelectItem value="museum">Museums</SelectItem>
                            <SelectItem value="hospital">Hospitals</SelectItem>
                            <SelectItem value="cinema">
                                Movie Theater
                            </SelectItem>
                            <SelectItem value="library">Library</SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
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
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Suspense
                    fallback={
                        <div className="flex items-center justify-center w-full h-8">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="animate-spin"
                            >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                        </div>
                    }
                >
                    <TentacleLocationSelector
                        data={data}
                        index={index}
                        promise={findTentacleLocations(data)}
                    />
                </Suspense>
            </SidebarMenuItem>
        </QuestionCard>
    );
};

const TentacleLocationSelector = ({
    data,
    index,
    promise,
}: {
    data: TentacleQuestion;
    index: number;
    promise: Promise<any>;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const locations = use(promise);

    return (
        <Select
            value={data.location ? data.location.properties.name : "false"}
            onValueChange={(value) => {
                const newQuestions = [...$questions];
                if (value === "false") {
                    (newQuestions[index].data as TentacleQuestion).location =
                        false;
                } else {
                    (newQuestions[index].data as TentacleQuestion).location =
                        locations.features.find(
                            (feature: any) => feature.properties.name === value,
                        );
                }
                questions.set(newQuestions);
            }}
            disabled={!!$hiderMode}
        >
            <SelectTrigger>
                <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="false">Not Within</SelectItem>
                {locations.features.map((feature: any) => (
                    <SelectItem
                        key={feature.properties.name}
                        value={feature.properties.name}
                    >
                        {feature.properties.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
