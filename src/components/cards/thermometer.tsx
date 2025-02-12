import type { ThermometerQuestion } from "../../maps/thermometer";
import { LatitudeLongitude } from "../LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import { hiderMode, questions, triggerLocalRefresh } from "../../lib/context";
import { iconColors } from "../../maps/api";
import { MENU_ITEM_CLASSNAME, SidebarMenuItem } from "../ui/sidebar-l";
import { Checkbox } from "../ui/checkbox";
import { Separator } from "../ui/separator";
import { QuestionCard } from "./base";

export const ThermometerQuestionComponent = ({
    data,
    questionKey,
    index,
    sub,
    className,
    showDeleteButton = true,
}: {
    data: ThermometerQuestion;
    questionKey: number;
    index: number;
    sub?: string;
    className?: string;
    showDeleteButton?: boolean;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
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
                    disabled={!!$hiderMode}
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
                    "text-xl font-semibold font-poppins",
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
                    "text-xl font-semibold font-poppins",
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
