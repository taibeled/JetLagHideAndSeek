import { useStore } from "@nanostores/react";
import { distance, point } from "@turf/turf";

import { QuestionCard } from "@/components/cards/base";
import {
    type QuestionCardComponentProps,
    questionCardControls,
    ResultRow,
    useQuestionLabel,
} from "@/components/cards/shared";
import { LatitudeLongitude } from "@/components/LatLngPicker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    defaultUnit,
    hiderMode,
    isLoading,
    questionModified,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import { ICON_COLOR_LABELS, ICON_COLORS, type IconColorKey } from "@/maps/api";
import type { ThermometerQuestion } from "@/maps/schema";

const firstPinColorNot = (avoid: IconColorKey): IconColorKey => {
    const keys = Object.keys(ICON_COLORS) as IconColorKey[];
    return keys.find((k) => k !== avoid) ?? keys[0]!;
};

export const ThermometerQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: QuestionCardComponentProps<ThermometerQuestion>) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $isLoading = useStore(isLoading);

    const $defaultUnit = useStore(defaultUnit);
    const DISTANCE_UNIT = $defaultUnit ?? "miles";

    const label = useQuestionLabel("thermometer", questionKey);

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
            {...questionCardControls(data)}
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

            <SidebarMenuItem>
                <div
                    className={cn(
                        MENU_ITEM_CLASSNAME,
                        "flex flex-col gap-2 items-stretch",
                    )}
                >
                    <Label className="text-sm font-medium">
                        Start pin color
                    </Label>
                    <Select<IconColorKey>
                        trigger="Color"
                        value={data.colorA}
                        options={{ ...ICON_COLOR_LABELS }}
                        disabled={!data.drag || $isLoading}
                        onValueChange={(c) =>
                            questionModified(() => {
                                data.colorA = c;
                                if (data.colorB === c) {
                                    data.colorB = firstPinColorNot(c);
                                }
                            })
                        }
                    />
                </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
                <div
                    className={cn(
                        MENU_ITEM_CLASSNAME,
                        "flex flex-col gap-2 items-stretch",
                    )}
                >
                    <Label className="text-sm font-medium">End pin color</Label>
                    <Select<IconColorKey>
                        trigger="Color"
                        value={data.colorB}
                        options={{ ...ICON_COLOR_LABELS }}
                        disabled={!data.drag || $isLoading}
                        onValueChange={(c) =>
                            questionModified(() => {
                                data.colorB = c;
                                if (data.colorA === c) {
                                    data.colorA = firstPinColorNot(c);
                                }
                            })
                        }
                    />
                </div>
            </SidebarMenuItem>

            {distanceValue !== null && (
                <div className="px-2 text-sm text-muted-foreground">
                    Distance:{" "}
                    <span className="font-medium text-foreground">
                        {distanceValue.toFixed(3)} {unitLabel}
                    </span>
                </div>
            )}

            <ResultRow>
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
            </ResultRow>
        </QuestionCard>
    );
};
