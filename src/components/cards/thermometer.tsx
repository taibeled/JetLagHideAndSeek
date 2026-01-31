import { useStore } from "@nanostores/react";
import { defaultUnit } from "@/lib/context";
import { LatitudeLongitude } from "@/components/LatLngPicker";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

/* ---- distance helpers (turf) ---- */
import distance from "@turf/distance";
import { point } from "@turf/helpers";
/* -------------------------------- */

const VALID_UNITS = ["miles", "kilometers", "meters"] as const;
type ValidUnit = (typeof VALID_UNITS)[number];

const normalizeUnit = (unit: string): ValidUnit =>
    VALID_UNITS.includes(unit as ValidUnit) ? (unit as ValidUnit) : "miles";

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

    // normalize external string into something turf accepts
    const $defaultUnit = useStore(defaultUnit);
    const DISTANCE_UNIT = normalizeUnit($defaultUnit ?? "miles");

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
              { units: DISTANCE_UNIT }
          )
        : null;

    const unitLabel =
        DISTANCE_UNIT === "meters"
            ? "Meters"
            : DISTANCE_UNIT === "kilometers"
            ? "KM"
            : "Miles";

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
                    onValueChange={(value: "warmer" | "colder") =>
                        questionModified((data.warmer = value === "warmer"))
                    }
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
