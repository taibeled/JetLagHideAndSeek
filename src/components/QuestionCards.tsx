import type { RadiusQuestion } from "../maps/radius";
import type { ThermometerQuestion } from "../maps/thermometer";
import type { TentacleQuestion } from "../maps/tentacles";
import { VscChromeClose, VscChevronDown } from "react-icons/vsc";
import { Suspense, use, useState } from "react";
import { LatitudeLongitude } from "./LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../lib/utils";
import { questions } from "../utils/context";
import { findTentacleLocations, iconColors } from "../maps/api";
import type { MatchingQuestion, ZoneMatchingQuestion } from "../maps/matching";
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
import type { MeasuringQuestion } from "@/maps/measuring";

const QuestionCard = ({
    children,
    questionKey,
    className,
    label,
}: {
    children: React.ReactNode;
    questionKey: number;
    className?: string;
    label?: string;
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const $questions = useStore(questions);

    const toggleCollapse = () => {
        setIsCollapsed((prevState) => !prevState);
    };

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
                    <button
                        onClick={toggleCollapse}
                        className={cn(
                            "absolute top-2 left-2 text-white border rounded-md transition-all duration-500",
                            isCollapsed && "-rotate-90"
                        )}
                    >
                        <VscChevronDown />
                    </button>
                    <SidebarGroupLabel className="ml-8 mr-8">
                        {label}
                    </SidebarGroupLabel>
                    <SidebarGroupContent
                        className={cn(
                            "overflow-hidden transition-all duration-1000 max-h-[100rem]", // 100rem is arbitrary
                            isCollapsed && "max-h-0"
                        )}
                    >
                        <SidebarMenu>{children}</SidebarMenu>
                    </SidebarGroupContent>
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
    const $questions = useStore(questions);
    const label = `Radius
    ${
        $questions
            .filter((q) => q.id === "radius")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    return (
        <QuestionCard questionKey={questionKey} label={label}>
            <SidebarMenuItem>
                <div className={cn(MENU_ITEM_CLASSNAME, "gap-2 flex flex-row")}>
                    <Input
                        type="number"
                        className="rounded-md p-2 w-16"
                        value={data.radius}
                        onChange={(e) => {
                            const newQuestions = [...$questions];
                            (newQuestions[index].data as typeof data).radius =
                                parseInt(e.target.value);
                            questions.set(newQuestions);
                        }}
                    />
                    <Select
                        value={data.unit ?? "miles"}
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
                <label className="text-2xl font-semibold font-poppins">
                    Within
                </label>
                <Checkbox
                    checked={data.within}
                    onCheckedChange={(checked) => {
                        const newQuestions = [...$questions];
                        (newQuestions[index].data as typeof data).within =
                            (checked ?? false) as boolean;
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

export const MatchingQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: MatchingQuestion;
    questionKey: number;
    index: number;
}) => {
    const $questions = useStore(questions);
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
            questionSpecific = (
                <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                    <Select
                        value={data.cat.adminLevel.toString()}
                        onValueChange={(value) => {
                            const newQuestions = [...$questions];
                            (
                                newQuestions[index].data as ZoneMatchingQuestion
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
            );
    }

    return (
        <QuestionCard questionKey={questionKey} label={label}>
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
                    </SelectContent>
                </Select>
            </SidebarMenuItem>
            {questionSpecific}
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <label className="text-2xl font-semibold font-poppins">
                    Same
                </label>
                <Checkbox
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
                    "text-2xl font-semibold font-poppins"
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
export const MeasuringQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: MeasuringQuestion;
    questionKey: number;
    index: number;
}) => {
    const $questions = useStore(questions);
    const label = `Measuring
    ${
        $questions
            .filter((q) => q.id === "measuring")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    let questionSpecific = <></>;

    switch (data.type) {
    }

    return (
        <QuestionCard questionKey={questionKey} label={label}>
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
                    </SelectContent>
                </Select>
            </SidebarMenuItem>
            {questionSpecific}
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <label className="text-2xl font-semibold font-poppins">
                    Hider Closer
                </label>
                <Checkbox
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
                    "text-2xl font-semibold font-poppins"
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

export const TentacleQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: TentacleQuestion;
    questionKey: number;
    index: number;
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
        <QuestionCard questionKey={questionKey} label={label}>
            <SidebarMenuItem>
                <div className={cn(MENU_ITEM_CLASSNAME, "gap-2 flex flex-row")}>
                    <Input
                        type="number"
                        className="rounded-md p-2 w-16"
                        value={data.radius}
                        onChange={(e) => {
                            const newQuestions = [...$questions];
                            (newQuestions[index].data as typeof data).radius =
                                parseInt(e.target.value);
                            questions.set(newQuestions);
                        }}
                    />
                    <Select
                        value={data.unit ?? "miles"}
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
                        <SelectItem value="theme_park">
                            Theme Parks (typically 15 miles)
                        </SelectItem>
                        <SelectItem value="zoo">
                            Zoos (typically 15 miles)
                        </SelectItem>
                        <SelectItem value="aquarium">
                            Aquariums (typically 15 miles)
                        </SelectItem>
                        <SelectItem value="museum">
                            Museums (typically 1 mile)
                        </SelectItem>
                        <SelectItem value="hospital">
                            Hospitals (typically 1 mile)
                        </SelectItem>
                        <SelectItem value="cinema">
                            Movie Theater (typically 1 mile)
                        </SelectItem>
                        <SelectItem value="library">
                            Library (typically 1 mile)
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
    const $questions = useStore(questions);
    const label = `Thermometer
    ${
        $questions
            .filter((q) => q.id === "thermometer")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    return (
        <QuestionCard questionKey={questionKey} label={label}>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <label className="text-2xl font-semibold font-poppins">
                    Warmer
                </label>
                <Checkbox
                    checked={data.warmer}
                    onCheckedChange={(checked) => {
                        const newQuestions = [...$questions];
                        (newQuestions[index].data as typeof data).warmer =
                            (checked ?? false) as boolean;
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
                        (newQuestions[index].data as typeof data).latA = lat;
                    }
                    if (lng !== null) {
                        (newQuestions[index].data as typeof data).lngA = lng;
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
                        (newQuestions[index].data as typeof data).latB = lat;
                    }
                    if (lng !== null) {
                        (newQuestions[index].data as typeof data).lngB = lng;
                    }
                    questions.set(newQuestions);
                }}
            />
        </QuestionCard>
    );
};
