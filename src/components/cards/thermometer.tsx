import { useStore } from "@nanostores/react";

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

/* ---- distance helpers ---- */
const toRadians = (deg: number) => (deg * Math.PI) / 180;

const distanceMiles = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
) => {
    const R = 3958.8; // Earth radius in miles
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// Conversion factor
const milesToKm = 1.60934;

const distanceKm = (miles: number) => {
    return miles * milesToKm;
};
/* -------------------------- */

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

    const distance =
        hasCoords
            ? distanceMiles(data.latA, data.lngA, data.latB, data.lngB)
            : null;

    const distanceInKm = distance !== null ? distanceKm(distance) : null;

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
                    if (lat !== null) {
                        data.latA = lat;
                    }
                    if (lng !== null) {
                        data.lngA = lng;
                    }
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
                    if (lat !== null) {
                        data.latB = lat;
                    }
                    if (lng !== null) {
                        data.lngB = lng;
                    }
                    questionModified();
                }}
                disabled={!data.drag || $isLoading}
            />

            {distance !== null && (
                <div className="px-2 text-sm text-muted-foreground">
                    Distance:{" "}
                    <span className="font-medium text-foreground">
                        {distance.toFixed(2)} miles /{" "}
                        {distanceInKm?.toFixed(2)} km
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
