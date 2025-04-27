import { Suspense, use } from "react";
import { LatitudeLongitude } from "../LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import {
    drawingQuestionKey,
    hiderMode,
    questionModified,
    questions,
    triggerLocalRefresh,
    isLoading,
} from "../../lib/context";
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
import type {
    TentacleQuestion,
    TraditionalTentacleQuestion,
} from "@/lib/schema";
import { UnitSelect } from "../UnitSelect";
import * as turf from "@turf/turf";

export const TentacleQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
    showDeleteButton = true,
}: {
    data: TentacleQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
    showDeleteButton?: boolean;
}) => {
    const $questions = useStore(questions);
    const $drawingQuestionKey = useStore(drawingQuestionKey);
    const $isLoading = useStore(isLoading);
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
                        onChange={(e) =>
                            questionModified(
                                (data.radius = parseFloat(e.target.value)),
                            )
                        }
                        disabled={!data.drag || $isLoading}
                    />
                    <UnitSelect
                        unit={data.unit}
                        onChange={(unit) =>
                            questionModified((data.unit = unit))
                        }
                        disabled={!data.drag || $isLoading}
                    />
                </div>
            </SidebarMenuItem>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Select
                    value={data.locationType}
                    onValueChange={async (value) => {
                        if (value === "custom") {
                            const priorLocations = await findTentacleLocations(
                                data as TraditionalTentacleQuestion,
                            );

                            data.locationType = "custom";
                            data.places = priorLocations.features.map((x) => ({
                                ...x,
                                properties: {
                                    ...x.properties,
                                    name:
                                        x.properties?.["name:en"] ??
                                        x.properties?.name,
                                },
                            }));
                            data.location = false;
                        } else {
                            data.location = false;
                            data.locationType = value as any;
                        }
                        questionModified();
                    }}
                    disabled={!data.drag || $isLoading}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Location Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="custom">Custom Locations</SelectItem>
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
            {data.locationType === "custom" && data.drag && (
                <p className="px-2 mb-1 text-center text-orange-500">
                    To modify tentacle locations, enable it:
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
            )}
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
                        promise={
                            data.locationType === "custom"
                                ? Promise.resolve(
                                      turf.featureCollection(data.places),
                                  )
                                : findTentacleLocations(data)
                        }
                        disabled={!data.drag || $isLoading}
                    />
                </Suspense>
            </SidebarMenuItem>
        </QuestionCard>
    );
};

const TentacleLocationSelector = ({
    data,
    promise,
    disabled,
}: {
    data: TentacleQuestion;
    promise: Promise<any>;
    disabled: boolean;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const locations = use(promise);

    return (
        <Select
            value={data.location ? data.location.properties.name : "false"}
            onValueChange={(value) => {
                if (value === "false") {
                    data.location = false;
                } else {
                    data.location = locations.features.find(
                        (feature: any) => feature.properties.name === value,
                    );
                }

                questionModified();
            }}
            disabled={!!$hiderMode || disabled}
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
