import { useStore } from "@nanostores/react";

import { LatitudeLongitude } from "@/components/LatLngPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UnitSelect } from "@/components/UnitSelect";
import {
    hiderMode,
    isLoading,
    questionModified,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import type { RadiusQuestion } from "@/maps/schema";

import { QuestionCard } from "./base";
import { QuestionDebugDetails } from "./debug";

export const RadiusQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: {
    data: RadiusQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const $isLoading = useStore(isLoading);
    const label = `Radius
    ${
        $questions
            .filter((q) => q.id === "radius")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    const applyRadiusPresetKm = (distanceKm: number) => {
        if (data.unit === "meters") {
            data.radius = distanceKm * 1000;
        } else if (data.unit === "miles") {
            data.radius = distanceKm / 1.609344;
        } else {
            data.radius = distanceKm;
        }

        questionModified();
    };

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            collapsed={data.collapsed}
            setCollapsed={(collapsed) => {
                data.collapsed = collapsed; // Doesn't trigger a re-render so no need for questionModified
            }}
            locked={!data.drag}
            setLocked={(locked) => questionModified((data.drag = !locked))}
        >
            <SidebarMenuItem>
                <div className={cn(MENU_ITEM_CLASSNAME, "gap-2 flex flex-row")}>
                    <Input
                        type="number"
                        className="rounded-md p-2 w-16"
                        value={data.radius}
                        disabled={!data.drag || $isLoading}
                        onChange={(e) =>
                            questionModified(
                                (data.radius = parseFloat(e.target.value)),
                            )
                        }
                    />
                    <UnitSelect
                        unit={data.unit}
                        disabled={!data.drag || $isLoading}
                        onChange={(unit) =>
                            questionModified((data.unit = unit))
                        }
                    />
                </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
                <div className="px-2 pt-1 pb-1 w-full">
                    <div className="text-xs text-muted-foreground mb-1">
                        Quick distance
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!data.drag || $isLoading}
                            onClick={() => applyRadiusPresetKm(0.5)}
                        >
                            500m
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!data.drag || $isLoading}
                            onClick={() => applyRadiusPresetKm(1)}
                        >
                            1km
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!data.drag || $isLoading}
                            onClick={() => applyRadiusPresetKm(2)}
                        >
                            2km
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!data.drag || $isLoading}
                            onClick={() => applyRadiusPresetKm(5)}
                        >
                            5km
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!data.drag || $isLoading}
                            onClick={() => applyRadiusPresetKm(10)}
                        >
                            10km
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!data.drag || $isLoading}
                            onClick={() => applyRadiusPresetKm(15)}
                        >
                            15km
                        </Button>
                    </div>
                </div>
            </SidebarMenuItem>
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                colorName={data.color}
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
            <QuestionDebugDetails
                debug={(data as any).debug}
                showHider={$hiderMode !== false}
            />
            <div className="flex gap-2 items-center p-2">
                <Label
                    className={cn(
                        "font-semibold text-lg",
                        $isLoading && "text-muted-foreground",
                    )}
                >
                    Result
                </Label>
                <ToggleGroup
                    className="grow"
                    type="single"
                    value={data.within ? "inside" : "outside"}
                    onValueChange={(value: "inside" | "outside") => {
                        questionModified((data.within = value === "inside"));
                        if ((data as any).debug && typeof (data as any).debug === "object") {
                            (data as any).debug = {
                                ...(data as any).debug,
                                detectedResult: value,
                            };
                        }
                    }}
                    disabled={!!$hiderMode || !data.drag || $isLoading}
                >
                    <ToggleGroupItem value="outside">Outside</ToggleGroupItem>
                    <ToggleGroupItem value="inside">Inside</ToggleGroupItem>
                </ToggleGroup>
            </div>
        </QuestionCard>
    );
};
