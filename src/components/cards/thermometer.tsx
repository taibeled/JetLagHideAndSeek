import { useStore } from "@nanostores/react";
import { bearing, destination, distance, point } from "@turf/turf";
import { useState } from "react";

import { LatitudeLongitude } from "@/components/LatLngPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defaultUnit } from "@/lib/context";
import {
    hiderMode,
    isLoading,
    questionModified,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import type { ThermometerQuestion } from "@/maps/schema";

import { QuestionCard } from "./base";
import { QuestionDebugDetails } from "./debug";

export const ThermometerQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: {
    data: ThermometerQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const $isLoading = useStore(isLoading);
    const [customDistanceKm, setCustomDistanceKm] = useState<string>("1");

    const $defaultUnit = useStore(defaultUnit);
    const DISTANCE_UNIT = $defaultUnit ?? "kilometers";

    const label = `Thermometer
    ${
        $questions
            .filter((q) => q.id === "thermometer")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    const hasCoords =
        data.latA !== null &&
        data.lngA !== null &&
        data.latB !== null &&
        data.lngB !== null;

    const distanceValue = hasCoords
        ? distance(
              point([data.lngA!, data.latA!]),
              point([data.lngB!, data.latB!]),
              { units: DISTANCE_UNIT },
          )
        : null;

    const unitLabel = DISTANCE_UNIT === "meters" ? "Meters" : "KM";

    const applyDistancePresetKm = (distanceKm: number) => {
        const start = point([data.lngA, data.latA]);
        const end = point([data.lngB, data.latB]);
        const currentBearing = bearing(start, end);
        const updatedEnd = destination(start, distanceKm, currentBearing, {
            units: "kilometers",
        });

        data.latB = updatedEnd.geometry.coordinates[1];
        data.lngB = updatedEnd.geometry.coordinates[0];
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
                data.collapsed = collapsed;
            }}
            locked={!data.drag}
            setLocked={(locked) => questionModified((data.drag = !locked))}
        >
            <LatitudeLongitude
                latitude={data.latA}
                longitude={data.lngA}
                label="Start"
                colorName={data.colorA}
                onChange={(lat, lng) => {
                    if (lat !== null) data.latA = lat;
                    if (lng !== null) data.lngA = lng;
                    questionModified();
                }}
                disabled={!data.drag || $isLoading}
            />

            <LatitudeLongitude
                latitude={data.latB}
                longitude={data.lngB}
                label="End"
                colorName={data.colorB}
                onChange={(lat, lng) => {
                    if (lat !== null) data.latB = lat;
                    if (lng !== null) data.lngB = lng;
                    questionModified();
                }}
                disabled={!data.drag || $isLoading}
            />

            {distanceValue !== null && (
                <div className="px-2 text-sm text-muted-foreground">
                    Distance:{" "}
                    <span className="font-medium text-foreground">
                        {distanceValue.toFixed(3)} {unitLabel}
                    </span>
                </div>
            )}

            <QuestionDebugDetails
                debug={(data as any).debug}
                showHider={$hiderMode !== false}
            />

            <div className="px-2 text-xs text-muted-foreground">
                Tip: drag start/end pins on the map to adjust distance and
                orientation.
            </div>

            <div className="px-2 pt-1 pb-1">
                <div className="text-xs text-muted-foreground mb-1">
                    Quick distance
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data.drag || $isLoading}
                        onClick={() => applyDistancePresetKm(0.5)}
                    >
                        500m
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data.drag || $isLoading}
                        onClick={() => applyDistancePresetKm(1)}
                    >
                        1km
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data.drag || $isLoading}
                        onClick={() => applyDistancePresetKm(2)}
                    >
                        2km
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data.drag || $isLoading}
                        onClick={() => applyDistancePresetKm(5)}
                    >
                        5km
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data.drag || $isLoading}
                        onClick={() => applyDistancePresetKm(10)}
                    >
                        10km
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data.drag || $isLoading}
                        onClick={() => applyDistancePresetKm(15)}
                    >
                        15km
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data.drag || $isLoading}
                        onClick={() => applyDistancePresetKm(20)}
                    >
                        20km
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data.drag || $isLoading}
                        onClick={() => applyDistancePresetKm(25)}
                    >
                        25km
                    </Button>
                </div>
                <div className="flex gap-2 mt-2 items-center">
                    <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={customDistanceKm}
                        onChange={(e) => setCustomDistanceKm(e.target.value)}
                        disabled={!data.drag || $isLoading}
                        className="w-24"
                    />
                    <span className="text-xs text-muted-foreground">km</span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data.drag || $isLoading}
                        onClick={() => {
                            const parsed = parseFloat(customDistanceKm);
                            if (!Number.isFinite(parsed) || parsed <= 0) return;
                            applyDistancePresetKm(parsed);
                        }}
                    >
                        Apply
                    </Button>
                </div>
            </div>

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
                    value={data.warmer ? "warmer" : "colder"}
                    onValueChange={(value: "warmer" | "colder") => {
                        questionModified((data.warmer = value === "warmer"));
                        if ((data as any).debug && typeof (data as any).debug === "object") {
                            (data as any).debug = {
                                ...(data as any).debug,
                                detectedResult: value,
                            };
                        }
                    }}
                    disabled={!!$hiderMode || !data.drag || $isLoading}
                >
                    <ToggleGroupItem color="red" value="colder">
                        Colder
                    </ToggleGroupItem>
                    <ToggleGroupItem value="warmer">Warmer</ToggleGroupItem>
                </ToggleGroup>
            </div>
        </QuestionCard>
    );
};
