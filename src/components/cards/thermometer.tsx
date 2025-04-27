import { LatitudeLongitude } from "../LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import {
    hiderMode,
    questionModified,
    questions,
    triggerLocalRefresh,
    isLoading,
} from "../../lib/context";
import { iconColors } from "../../maps/api";
import { MENU_ITEM_CLASSNAME, SidebarMenuItem } from "../ui/sidebar-l";
import { Checkbox } from "../ui/checkbox";
import { Separator } from "../ui/separator";
import { QuestionCard } from "./base";
import type { ThermometerQuestion } from "@/lib/schema";

export const ThermometerQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
    showDeleteButton = true,
}: {
    data: ThermometerQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
    showDeleteButton?: boolean;
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

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            showDeleteButton={showDeleteButton}
        >
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <label className="text-2xl font-semibold font-poppins">
                    Warmer
                </label>
                <Checkbox
                    disabled={!!$hiderMode || !data.drag || $isLoading}
                    checked={data.warmer}
                    onCheckedChange={(checked) =>
                        questionModified((data.warmer = checked as boolean))
                    }
                />
            </SidebarMenuItem>
            <SidebarMenuItem
                className={cn(
                    MENU_ITEM_CLASSNAME,
                    "text-xl font-semibold font-poppins",
                )}
                style={{
                    backgroundColor: iconColors[data.colorA],
                    color: data.colorA === "gold" ? "black" : undefined,
                }}
            >
                Color start (lock{" "}
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
                latitude={data.latA}
                longitude={data.lngA}
                latLabel="Latitude Start"
                lngLabel="Longitude Start"
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
            <Separator className="my-2" />
            <SidebarMenuItem
                className={cn(
                    MENU_ITEM_CLASSNAME,
                    "text-xl font-semibold font-poppins",
                )}
                style={{
                    backgroundColor: iconColors[data.colorB],
                    color: data.colorB === "gold" ? "black" : undefined,
                }}
            >
                Color end
            </SidebarMenuItem>
            <LatitudeLongitude
                latitude={data.latB}
                longitude={data.lngB}
                latLabel="Latitude End"
                lngLabel="Longitude End"
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
        </QuestionCard>
    );
};
