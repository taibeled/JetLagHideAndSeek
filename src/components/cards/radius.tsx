import { useStore } from "@nanostores/react";

import { QuestionCard } from "@/components/cards/base";
import {
    applyLatLng,
    type QuestionCardComponentProps,
    questionCardControls,
    RadiusUnitRow,
    ResultRow,
    useQuestionLabel,
} from "@/components/cards/shared";
import { LatitudeLongitude } from "@/components/LatLngPicker";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    hiderMode,
    isLoading,
    questionModified,
    triggerLocalRefresh,} from "@/lib/context";
import type { RadiusQuestion } from "@/maps/schema";

export const RadiusQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: QuestionCardComponentProps<RadiusQuestion>) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $isLoading = useStore(isLoading);
    const label = useQuestionLabel("radius", questionKey);

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            {...questionCardControls(data)}
        >
            <RadiusUnitRow data={data} disabled={!data.drag || $isLoading} />
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                colorName={data.color}
                onChange={applyLatLng(data)}
                disabled={!data.drag || $isLoading}
            />
            <ResultRow>
                <ToggleGroup
                    className="grow"
                    type="single"
                    value={data.within ? "inside" : "outside"}
                    onValueChange={(value: "inside" | "outside") =>
                        questionModified((data.within = value === "inside"))
                    }
                    disabled={!!$hiderMode || !data.drag || $isLoading}
                >
                    <ToggleGroupItem value="outside">Outside</ToggleGroupItem>
                    <ToggleGroupItem value="inside">Inside</ToggleGroupItem>
                </ToggleGroup>
            </ResultRow>
        </QuestionCard>
    );
};
