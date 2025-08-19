import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { Suspense, use } from "react";

import { LatitudeLongitude } from "@/components/LatLngPicker";
import PresetsDialog from "@/components/PresetsDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { UnitSelect } from "@/components/UnitSelect";
import {
    drawingQuestionKey,
    hiderMode,
    isLoading,
    questionModified,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn, mapToObj } from "@/lib/utils";
import { findTentacleLocations } from "@/maps/api";
import {
    determineUnionizedStrings,
    NO_GROUP,
    type TentacleQuestion,
    tentacleQuestionSchema,
    type TraditionalTentacleQuestion,
} from "@/maps/schema";

import { QuestionCard } from "./base";

export const TentacleQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: {
    data: TentacleQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
}) => {
    const $questions = useStore(questions);
    const $drawingQuestionKey = useStore(drawingQuestionKey);
    const $isLoading = useStore(isLoading);
    const label = `Tentacles
    ${
        $questions
            .filter((q) => q.id === "tentacles")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

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
                        onChange={(e) =>
                            questionModified(
                                (data.radius = parseFloat(e.target.value)),
                            )
                        }
                        disabled={!data.drag || $isLoading}
                    />
                    <UnitSelect
                        unit={data.unit}
                        onChange={(unit) =>
                            questionModified((data.unit = unit))
                        }
                        disabled={!data.drag || $isLoading}
                    />
                </div>
            </SidebarMenuItem>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Select
                    trigger="Location Type"
                    options={Object.fromEntries(
                        tentacleQuestionSchema.options
                            .filter((x) => x.description === NO_GROUP)
                            .flatMap((x) =>
                                determineUnionizedStrings(x.shape.locationType),
                            )
                            .map((x) => [(x._def as any).value, x.description]),
                    )}
                    groups={Object.fromEntries(
                        tentacleQuestionSchema.options
                            .filter((x) => x.description !== NO_GROUP)
                            .map((x) => [
                                x.description,
                                Object.fromEntries(
                                    determineUnionizedStrings(
                                        x.shape.locationType,
                                    ).map((x) => [
                                        (x._def as any).value,
                                        x.description,
                                    ]),
                                ),
                            ]),
                    )}
                    value={data.locationType}
                    onValueChange={async (value) => {
                        if (value === "custom") {
                            const priorLocations = await findTentacleLocations(
                                data as TraditionalTentacleQuestion,
                            );

                            data.locationType = "custom";
                            data.places = priorLocations.features.map((x) => ({
                                ...x,
                                properties: {
                                    ...x.properties,
                                    name:
                                        x.properties?.["name:en"] ??
                                        x.properties?.name,
                                },
                            }));
                            data.location = false;
                        } else {
                            data.location = false;
                            data.locationType = value;
                        }
                        questionModified();
                    }}
                    disabled={!data.drag || $isLoading}
                />
            </SidebarMenuItem>
            {data.locationType === "custom" && data.drag && (
                <>
                    <p className="px-2 mb-1 text-center text-orange-500">
                        To modify tentacle locations, enable it:
                        <Checkbox
                            className="mx-1 my-1"
                            checked={$drawingQuestionKey === questionKey}
                            onCheckedChange={(checked) => {
                                if (checked) {
                                    drawingQuestionKey.set(questionKey);
                                } else {
                                    drawingQuestionKey.set(-1);
                                }
                            }}
                            disabled={!data.drag || $isLoading}
                        />
                        and use the buttons at the bottom left of the map.
                    </p>
                    <div className="flex justify-center mb-2">
                        <PresetsDialog
                            data={data}
                            presetTypeHint="custom-tentacles"
                        />
                    </div>
                </>
            )}
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
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Suspense
                    fallback={
                        <div className="flex items-center justify-center w-full h-8">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="animate-spin"
                            >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                        </div>
                    }
                >
                    <TentacleLocationSelector
                        data={data}
                        promise={
                            data.locationType === "custom"
                                ? Promise.resolve(
                                      turf.featureCollection(data.places),
                                  )
                                : findTentacleLocations(data)
                        }
                        disabled={!data.drag || $isLoading}
                    />
                </Suspense>
            </SidebarMenuItem>
        </QuestionCard>
    );
};

const TentacleLocationSelector = ({
    data,
    promise,
    disabled,
}: {
    data: TentacleQuestion;
    promise: Promise<any>;
    disabled: boolean;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const locations = use(promise);

    // Filter locations to only those within the radius of the primary location
    const filteredFeatures = (() => {
        if (
            data.lat === null ||
            data.lng === null ||
            data.radius === undefined ||
            data.radius === null
        ) {
            return locations.features;
        }

        const center = turf.point([data.lng, data.lat]);

        return locations.features.filter((feature: any) => {
            const coords =
                feature?.geometry?.coordinates ??
                (feature?.properties?.lon && feature?.properties?.lat
                    ? [feature.properties.lon, feature.properties.lat]
                    : null);

            if (!coords) return false;

            const pt = turf.point(coords);
            const dist = turf.distance(center, pt, { units: data.unit });

            return dist <= data.radius;
        });
    })();

    // If the currently selected location is no longer within radius, clear it.
    const _selectedLocationName = data.location
        ? data.location.properties?.name
        : null;
    if (
        _selectedLocationName &&
        !filteredFeatures.find(
            (f: any) => f.properties.name === _selectedLocationName,
        )
    ) {
        data.location = false;
        questionModified();
    }

    return (
        <Select
            trigger="Location"
            options={{
                false: "Not Within",
                ...mapToObj(filteredFeatures, (feature: any) => [
                    feature.properties.name,
                    feature.properties.name,
                ]),
            }}
            value={data.location ? data.location.properties.name : "false"}
            onValueChange={(value) => {
                if (value === "false") {
                    data.location = false;
                } else {
                    data.location = filteredFeatures.find(
                        (feature: any) => feature.properties.name === value,
                    );
                }

                questionModified();
            }}
            disabled={!!$hiderMode || disabled}
        />
    );
};
