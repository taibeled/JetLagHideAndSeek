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
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { Checkbox } from "./ui/checkbox";

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
                                    <SelectValue placeholder="Theme" />
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
                            color: iconColors[data.color ?? "gold"],
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
            <div className="flex flex-col items-center gap-2 md:items-start md:flex-row mb-2">
                <div className="flex flex-col gap-2 ml-4 items-center">
                    <label className="text-white text-3xl italic font-semibold font-poppins">
                        Tentacles{" "}
                        {$questions
                            .filter((q) => q.id === "tentacles")
                            .map((q) => q.key)
                            .indexOf(questionKey) + 1}
                    </label>
                    <div className="gap-2 flex flex-row">
                        <input
                            type="number"
                            className="rounded-md p-2 text-slate-900 w-16"
                            value={data.radius}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).radius = parseInt(e.target.value);
                                questions.set(newQuestions);
                            }}
                        />
                        <select
                            className="rounded-md p-2 text-slate-900"
                            value={data.unit ?? "miles"}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).unit = e.target.value as any;
                                questions.set(newQuestions);
                            }}
                        >
                            <option value="miles">Miles</option>
                            <option value="kilometers">Kilometers</option>
                            <option value="meters">Meters</option>
                        </select>
                    </div>
                </div>
                <div className="flex flex-grow flex-col mt-2 gap-2 md:mt-0 items-center">
                    <select
                        className="rounded-md p-2 text-slate-900 w-[90%] md:w-[50%]"
                        value={data.locationType}
                        onChange={(e) => {
                            const newQuestions = [...$questions];
                            (
                                newQuestions[index].data as QuestionData
                            ).locationType = e.target.value as any;
                            questions.set(newQuestions);
                        }}
                    >
                        <option value="theme_park">Theme Parks</option>
                        <option value="zoo">Zoos</option>
                        <option value="museum">Museums</option>
                        <option value="aquarium">Aquariums</option>
                        <option value="hospital">Hospitals</option>
                    </select>
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
            <div className="flex mt-4 justify-center">
                <Suspense fallback={<div>Loading...</div>}>
                    <TentacleLocationSelector
                        data={data}
                        index={index}
                        promise={findTentacleLocations(data)}
                    />
                </Suspense>
            </div>
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
        <select
            className="rounded-md p-2 text-slate-900 w-[90%] md:w-[50%]"
            value={data.location ? data.location.properties.name : "false"}
            onChange={(e) => {
                const newQuestions = [...$questions];
                if (e.target.value === "false") {
                    (newQuestions[index].data as TentacleQuestion).location =
                        false;
                } else {
                    (newQuestions[index].data as TentacleQuestion).location =
                        locations.features.find(
                            (feature: any) =>
                                feature.properties.name === e.target.value
                        );
                }
                questions.set(newQuestions);
            }}
        >
            <option value="false">Not Within</option>
            {locations.features.map((feature: any) => (
                <option
                    key={feature.properties.name}
                    value={feature.properties.name}
                >
                    {feature.properties.name}
                </option>
            ))}
        </select>
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
            <div className="flex flex-col gap-3 md:gap-1 md:flex-row justify-between pr-8">
                <label className="text-white text-3xl italic font-semibold font-poppins">
                    Thermometer{" "}
                    {$questions
                        .filter((q) => q.id === "thermometer")
                        .map((q) => q.key)
                        .indexOf(questionKey) + 1}
                </label>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center flex-1 justify-center gap-2 ml-4">
                        <label className="text-white text-3xl italic font-semibold font-poppins mr-1">
                            Warmer
                        </label>
                        <input
                            type="checkbox"
                            className="rounded-md p-2 text-slate-900 scale-150"
                            checked={data.warmer}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).warmer = e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                    </div>
                </div>
            </div>
            <div className="flex flex-col gap-6 mt-4">
                <LatitudeLongitude
                    latitude={data.latA}
                    longitude={data.lngA}
                    latLabel="Latitude A"
                    lngLabel="Longitude A"
                    onChange={(lat, lng) => {
                        const newQuestions = [...$questions];
                        if (lat !== null) {
                            (newQuestions[index].data as QuestionData).latA =
                                lat;
                        }
                        if (lng !== null) {
                            (newQuestions[index].data as QuestionData).lngA =
                                lng;
                        }
                        questions.set(newQuestions);
                    }}
                >
                    <span
                        className="text-3xl italic font-semibold font-poppins text-center ml-4"
                        style={{ color: iconColors[data.colorA ?? "gold"] }}
                    >
                        Color A (drag{" "}
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
                </LatitudeLongitude>
                <LatitudeLongitude
                    latitude={data.latB}
                    longitude={data.lngB}
                    latLabel="Latitude B"
                    lngLabel="Longitude B"
                    onChange={(lat, lng) => {
                        const newQuestions = [...$questions];
                        if (lat !== null) {
                            (newQuestions[index].data as QuestionData).latB =
                                lat;
                        }
                        if (lng !== null) {
                            (newQuestions[index].data as QuestionData).lngB =
                                lng;
                        }
                        questions.set(newQuestions);
                    }}
                >
                    <span
                        className="text-3xl italic font-semibold font-poppins text-center ml-4"
                        style={{ color: iconColors[data.colorB ?? "gold"] }}
                    >
                        Color B (drag{" "}
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
                </LatitudeLongitude>
            </div>
        </QuestionCard>
    );
};
