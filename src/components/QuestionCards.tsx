import type { RadiusQuestion } from "../maps/radius";
import type { ThermometerQuestion } from "../maps/thermometer";
import type { TentacleQuestion } from "../maps/tentacles";
import { VscChromeClose } from "react-icons/vsc";
import { Suspense, use } from "react";
import { LatitudeLongitude } from "./LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../lib/utils";
import { questions } from "../utils/context";
import { findTentacleLocations, iconColors } from "../maps/api";
import type { MatchingQuestion } from "../maps/matching";
import {
    MENU_ITEM_CLASSNAME,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from "./ui/sidebar";
import { Input } from "./ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { Separator } from "./ui/separator";

const QuestionCard = ({
    children,
    questionKey,
    className,
}: {
    children: React.ReactNode;
    questionKey: number;
    className?: string;
}) => {
    const $questions = useStore(questions);

    return (
        <>
            <SidebarGroup className={className}>
                <div className="relative">
                    <button
                        className="absolute top-2 right-2 text-white"
                        onClick={() => {
                            questions.set(
                                $questions.filter((q) => q.key !== questionKey)
                            );
                        }}
                    >
                        <VscChromeClose />
                    </button>
                    {children}
                </div>
            </SidebarGroup>
            <Separator className="h-1" />
        </>
    );
};

export const RadiusQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: RadiusQuestion;
    questionKey: number;
    index: number;
}) => {
    type QuestionData = RadiusQuestion;

    const $questions = useStore(questions);

    return (
        <QuestionCard questionKey={questionKey}>
            <SidebarGroupLabel>
                Radius{" "}
                {$questions
                    .filter((q) => q.id === "radius")
                    .map((q) => q.key)
                    .indexOf(questionKey) + 1}
            </SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <div
                            className={cn(
                                MENU_ITEM_CLASSNAME,
                                "gap-2 flex flex-row"
                            )}
                        >
                            <Input
                                type="number"
                                className="rounded-md p-2 w-16"
                                value={data.radius}
                                onChange={(e) => {
                                    const newQuestions = [...$questions];
                                    (
                                        newQuestions[index].data as QuestionData
                                    ).radius = parseInt(e.target.value);
                                    questions.set(newQuestions);
                                }}
                            />
                            <Select
                                value={data.unit ?? "miles"}
                                onValueChange={(value) => {
                                    const newQuestions = [...$questions];
                                    (
                                        newQuestions[index].data as QuestionData
                                    ).unit = value as any;
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
                                    <SelectItem value="meters">
                                        Meters
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </SidebarMenuItem>
                    <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                        <label className="text-2xl font-semibold font-poppins">
                            Within
                        </label>
                        <Checkbox
                            checked={data.within}
                            onCheckedChange={(checked) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).within = (checked ?? false) as boolean;
                                questions.set(newQuestions);
                            }}
                        />
                    </SidebarMenuItem>
                    <SidebarMenuItem
                        className={cn(
                            MENU_ITEM_CLASSNAME,
                            "text-2xl font-semibold font-poppins"
                        )}
                        style={{
                            backgroundColor: iconColors[data.color ?? "gold"],
                            color:
                                (data.color ?? "gold") === "gold"
                                    ? "black"
                                    : undefined,
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
                                (newQuestions[index].data as QuestionData).lat =
                                    lat;
                            }
                            if (lng !== null) {
                                (newQuestions[index].data as QuestionData).lng =
                                    lng;
                            }
                            questions.set(newQuestions);
                        }}
                    />
                </SidebarMenu>
            </SidebarGroupContent>
        </QuestionCard>
    );
};

export const MatchingQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: MatchingQuestion;
    questionKey: number;
    index: number;
}) => {
    type QuestionData = MatchingQuestion;

    const $questions = useStore(questions);

    return (
        <QuestionCard questionKey={questionKey}>
            <div className="flex flex-col items-center gap-2 md:items-start md:flex-row mb-2">
                <div className="flex flex-col gap-2 ml-4">
                    <label className="text-white text-3xl italic font-semibold font-poppins">
                        Matching{" "}
                        {$questions
                            .filter((q) => q.id === "matching")
                            .map((q) => q.key)
                            .indexOf(questionKey) + 1}
                    </label>
                    <div className="gap-2 flex flex-row">
                        <select
                            className="rounded-md p-2 text-slate-900"
                            value={data.cat.adminLevel}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).cat.adminLevel = parseInt(
                                    e.target.value
                                ) as any;
                                questions.set(newQuestions);
                            }}
                        >
                            <option value="3">OSM Zone 3</option>
                            <option value="4">OSM Zone 4</option>
                            <option value="5">OSM Zone 5</option>
                            <option value="6">OSM Zone 6</option>
                            <option value="7">OSM Zone 7</option>
                            <option value="8">OSM Zone 8</option>
                            <option value="9">OSM Zone 9</option>
                            <option value="10">OSM Zone 10</option>
                        </select>
                    </div>
                </div>
                <div className="flex flex-grow flex-col mt-2 gap-2 md:mt-0">
                    <div className="flex items-center flex-1 justify-center gap-2 ml-4">
                        <label className="text-white text-3xl italic font-semibold font-poppins">
                            Same
                        </label>
                        <input
                            type="checkbox"
                            className="rounded-md p-2 text-slate-900 scale-150"
                            checked={data.same}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).same = e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                    </div>
                    <span
                        className="text-3xl italic font-semibold font-poppins text-center ml-4"
                        style={{ color: iconColors[data.color ?? "gold"] }}
                    >
                        Color (drag{" "}
                        <input
                            type="checkbox"
                            className="scale-150 mr-2"
                            checked={data.drag ?? false}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                newQuestions[index].data.drag =
                                    e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                        )
                    </span>
                </div>
            </div>
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                onChange={(lat, lng) => {
                    const newQuestions = [...$questions];
                    if (lat !== null) {
                        (newQuestions[index].data as QuestionData).lat = lat;
                    }
                    if (lng !== null) {
                        (newQuestions[index].data as QuestionData).lng = lng;
                    }
                    questions.set(newQuestions);
                }}
            />
        </QuestionCard>
    );
};

export const TentacleQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: TentacleQuestion;
    questionKey: number;
    index: number;
}) => {
    type QuestionData = TentacleQuestion;

    const $questions = useStore(questions);

    return (
        <QuestionCard questionKey={questionKey}>
            <SidebarGroupLabel>
                Tentacles{" "}
                {$questions
                    .filter((q) => q.id === "tentacles")
                    .map((q) => q.key)
                    .indexOf(questionKey) + 1}
            </SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <div
                            className={cn(
                                MENU_ITEM_CLASSNAME,
                                "gap-2 flex flex-row"
                            )}
                        >
                            <Input
                                type="number"
                                className="rounded-md p-2 w-16"
                                value={data.radius}
                                onChange={(e) => {
                                    const newQuestions = [...$questions];
                                    (
                                        newQuestions[index].data as QuestionData
                                    ).radius = parseInt(e.target.value);
                                    questions.set(newQuestions);
                                }}
                            />
                            <Select
                                value={data.unit ?? "miles"}
                                onValueChange={(value) => {
                                    const newQuestions = [...$questions];
                                    (
                                        newQuestions[index].data as QuestionData
                                    ).unit = value as any;
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
                                    <SelectItem value="meters">
                                        Meters
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </SidebarMenuItem>
                    <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                        <Select
                            value={data.locationType}
                            onValueChange={(value) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).locationType = value as any;
                                questions.set(newQuestions);
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Location Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="theme_park">
                                    Theme Parks
                                </SelectItem>
                                <SelectItem value="zoo">Zoos</SelectItem>
                                <SelectItem value="museum">Museums</SelectItem>
                                <SelectItem value="aquarium">
                                    Aquariums
                                </SelectItem>
                                <SelectItem value="hospital">
                                    Hospitals
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </SidebarMenuItem>
                    <SidebarMenuItem
                        className={cn(
                            MENU_ITEM_CLASSNAME,
                            "text-2xl font-semibold font-poppins"
                        )}
                        style={{
                            backgroundColor: iconColors[data.color ?? "gold"],
                            color:
                                (data.color ?? "gold") === "gold"
                                    ? "black"
                                    : undefined,
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
                                (newQuestions[index].data as QuestionData).lat =
                                    lat;
                            }
                            if (lng !== null) {
                                (newQuestions[index].data as QuestionData).lng =
                                    lng;
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
                </SidebarMenu>
            </SidebarGroupContent>
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
                            (feature: any) => feature.properties.name === value
                        );
                }
                questions.set(newQuestions);
            }}
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

export const ThermometerQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: ThermometerQuestion;
    questionKey: number;
    index: number;
}) => {
    type QuestionData = ThermometerQuestion;

    const $questions = useStore(questions);

    return (
        <QuestionCard questionKey={questionKey}>
            <SidebarGroupLabel>
                Thermometer{" "}
                {$questions
                    .filter((q) => q.id === "thermometer")
                    .map((q) => q.key)
                    .indexOf(questionKey) + 1}
            </SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                        <label className="text-2xl font-semibold font-poppins">
                            Warmer
                        </label>
                        <Checkbox
                            checked={data.warmer}
                            onCheckedChange={(checked) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).warmer = (checked ?? false) as boolean;
                                questions.set(newQuestions);
                            }}
                        />
                    </SidebarMenuItem>
                    <SidebarMenuItem
                        className={cn(
                            MENU_ITEM_CLASSNAME,
                            "text-xl font-semibold font-poppins"
                        )}
                        style={{
                            backgroundColor: iconColors[data.colorA ?? "gold"],
                            color:
                                (data.colorA ?? "gold") === "gold"
                                    ? "black"
                                    : undefined,
                        }}
                    >
                        Color start (drag{" "}
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
                        latitude={data.latA}
                        longitude={data.lngA}
                        latLabel="Latitude Start"
                        lngLabel="Longitude Start"
                        onChange={(lat, lng) => {
                            const newQuestions = [...$questions];
                            if (lat !== null) {
                                (
                                    newQuestions[index].data as QuestionData
                                ).latA = lat;
                            }
                            if (lng !== null) {
                                (
                                    newQuestions[index].data as QuestionData
                                ).lngA = lng;
                            }
                            questions.set(newQuestions);
                        }}
                    />
                    <Separator className="my-2" />
                    <SidebarMenuItem
                        className={cn(
                            MENU_ITEM_CLASSNAME,
                            "text-xl font-semibold font-poppins"
                        )}
                        style={{
                            backgroundColor: iconColors[data.colorB ?? "gold"],
                            color:
                                (data.colorB ?? "gold") === "gold"
                                    ? "black"
                                    : undefined,
                        }}
                    >
                        Color end (drag{" "}
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
                        latitude={data.latB}
                        longitude={data.lngB}
                        latLabel="Latitude End"
                        lngLabel="Longitude End"
                        onChange={(lat, lng) => {
                            const newQuestions = [...$questions];
                            if (lat !== null) {
                                (
                                    newQuestions[index].data as QuestionData
                                ).latB = lat;
                            }
                            if (lng !== null) {
                                (
                                    newQuestions[index].data as QuestionData
                                ).lngB = lng;
                            }
                            questions.set(newQuestions);
                        }}
                    />
                </SidebarMenu>
            </SidebarGroupContent>
        </QuestionCard>
    );
};
