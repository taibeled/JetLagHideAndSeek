import type { RadiusQuestion } from "../../maps/radius";
import { LatitudeLongitude } from "../LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import { hiderMode, questions, triggerLocalRefresh } from "../../lib/context";
import { iconColors } from "../../maps/api";
import { MENU_ITEM_CLASSNAME, SidebarMenuItem } from "../ui/sidebar-l";
import { Input } from "../ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { QuestionCard } from "./base";

export const RadiusQuestionComponent = ({
    data,
    questionKey,
    index,
    sub,
    className,
    showDeleteButton = true,
}: {
    data: RadiusQuestion;
    questionKey: number;
    index: number;
    sub?: string;
    className?: string;
    showDeleteButton?: boolean;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const label = `Radius
    ${
        $questions
            .filter((q) => q.id === "radius")
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
                        onChange={(e) => {
                            const newQuestions = [...$questions];
                            (newQuestions[index].data as typeof data).radius =
                                parseFloat(e.target.value);
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
                    disabled={!!$hiderMode}
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
                    "text-2xl font-semibold font-poppins",
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
