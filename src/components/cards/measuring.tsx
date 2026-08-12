import { useStore } from "@nanostores/react";
import * as React from "react";

import { QuestionCard } from "@/components/cards/base";
import {
    applyLatLng,
    CustomInitChoiceDialog,
    DrawingEnableNotice,
    groupedTypeOptions,
    HidingZoneClickNotice,
    type QuestionCardComponentProps,
    questionCardControls,
    ResultRow,
    ungroupedTypeOptions,
    useQuestionLabel,
} from "@/components/cards/shared";
import { FacilityOsmPlayToggles } from "@/components/FacilityOsmPlayToggles";
import { LatitudeLongitude } from "@/components/LatLngPicker";
import { Select } from "@/components/ui/select";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    customInitPreference,
    displayHidingZones,
    hiderMode,
    isLoading,
    questionModified,
    triggerLocalRefresh,} from "@/lib/context";
import { determineMeasuringBoundary } from "@/maps/questions/measuring";
import {
    type MeasuringQuestion,
    measuringQuestionSchema,
} from "@/maps/schema";

export const MeasuringQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: QuestionCardComponentProps<MeasuringQuestion>) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $displayHidingZones = useStore(displayHidingZones);
    const $isLoading = useStore(isLoading);
    const $customInitPref = useStore(customInitPreference);
    const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
    const label = useQuestionLabel("measuring", questionKey);

    let questionSpecific = <></>;

    const blankCustomGeo = () => {
        if (!(data as any).geo) {
            (data as any).geo = {
                type: "FeatureCollection",
                features: [],
            };
        } else {
            (data as any).geo.features = [];
        }
    };

    const prefillCustomGeo = async () => {
        const boundary = await determineMeasuringBoundary(data);
        if (!(data as any).geo) {
            (data as any).geo = {
                type: "FeatureCollection",
                features: [],
            };
        }
        (data as any).geo.features = boundary ? boundary : [];
    };

    switch (data.type) {
        case "pick-type":
            questionSpecific = (
                <p className="px-2 text-center text-sm text-muted-foreground">
                    Choose a measuring type above. No coastline, airport, or
                    other fetch runs until you pick one.
                </p>
            );
            break;
        case "city":
        case "aquarium-full":
        case "zoo-full":
        case "theme_park-full":
        case "peak-full":
        case "museum-full":
        case "hospital-full":
        case "cinema-full":
        case "library-full":
        case "golf_course-full":
        case "consulate-full":
        case "park-full":
            questionSpecific = (
                <FacilityOsmPlayToggles data={data} questionKey={questionKey} />
            );
            break;
        case "mcdonalds":
        case "seven11":
            questionSpecific = (
                <span className="px-2 text-center text-orange-500">
                    This question will eliminate hiding zones that don&apos;t
                    fit the criteria. When you click on a zone, the parts of
                    that zone that don&apos;t satisfy the criteria will be
                    eliminated.
                </span>
            );
            break;
        case "aquarium":
        case "hospital":
        case "peak":
        case "museum":
        case "theme_park":
        case "zoo":
        case "cinema":
        case "library":
        case "golf_course":
        case "consulate":
        case "park":
            questionSpecific = <HidingZoneClickNotice />;
            break;
        case "custom-measure":
            if (data.drag) {
                questionSpecific = (
                    <DrawingEnableNotice
                        subject="the measuring question"
                        questionKey={questionKey}
                        data={data}
                        presetTypeHint={data.type}
                        disabled={!data.drag || $isLoading}
                    />
                );
            }
            break;
    }

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            {...questionCardControls(data)}
        >
            <CustomInitChoiceDialog
                open={customDialogOpen}
                onOpenChange={setCustomDialogOpen}
                onChoice={async (choice) => {
                    if (choice === "blank") {
                        blankCustomGeo();
                    } else {
                        await prefillCustomGeo();
                    }
                    data.type = "custom-measure";
                    questionModified();
                    setCustomDialogOpen(false);
                }}
            />
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Select
                    trigger="Measuring Type"
                    options={ungroupedTypeOptions(
                        measuringQuestionSchema.options,
                        "type",
                    )}
                    groups={groupedTypeOptions(
                        measuringQuestionSchema.options,
                        "type",
                        { disabled: !$displayHidingZones },
                    )}
                    value={data.type}
                    onValueChange={async (value) => {
                        if (value === "custom-measure") {
                            if ($customInitPref === "ask") {
                                setCustomDialogOpen(true);
                                return;
                            }
                            if ($customInitPref === "blank") {
                                blankCustomGeo();
                            } else if ($customInitPref === "prefill") {
                                await prefillCustomGeo();
                            }
                        }
                        data.type = value;
                        questionModified();
                    }}
                    disabled={!data.drag || $isLoading}
                />
            </SidebarMenuItem>
            {questionSpecific}
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                colorName={data.color}
                onChange={applyLatLng(data)}
                disabled={!data.drag || $isLoading}
            />
            {data.type !== "pick-type" && (
                <ResultRow>
                    <ToggleGroup
                        className="grow"
                        type="single"
                        value={data.hiderCloser ? "closer" : "further"}
                        onValueChange={(value: "closer" | "further") =>
                            questionModified(
                                (data.hiderCloser = value === "closer"),
                            )
                        }
                        disabled={!!$hiderMode || !data.drag || $isLoading}
                    >
                        <ToggleGroupItem value="further">
                            Hider Further
                        </ToggleGroupItem>
                        <ToggleGroupItem value="closer">
                            Hider Closer
                        </ToggleGroupItem>
                    </ToggleGroup>
                </ResultRow>
            )}
        </QuestionCard>
    );
};
