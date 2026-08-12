import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { Suspense, use } from "react";

import { QuestionCard } from "@/components/cards/base";
import {
    applyLatLng,
    DrawingEnableNotice,
    groupedTypeOptions,
    type QuestionCardComponentProps,
    questionCardControls,
    RadiusUnitRow,
    ungroupedTypeOptions,
    useQuestionLabel,
} from "@/components/cards/shared";
import { LatitudeLongitude } from "@/components/LatLngPicker";
import { Select } from "@/components/ui/select";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import {
    hiderMode,
    isLoading,
    questionModified,
    triggerLocalRefresh,} from "@/lib/context";
import { mapToObj } from "@/lib/utils";
import { findTentacleLocations } from "@/maps/api";
import {
    type TentacleQuestion,
    tentacleQuestionSchema,
    type TraditionalTentacleQuestion,
} from "@/maps/schema";

export const TentacleQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: QuestionCardComponentProps<TentacleQuestion>) => {
    const $isLoading = useStore(isLoading);
    const label = useQuestionLabel("tentacles", questionKey);

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            {...questionCardControls(data)}
        >
            <RadiusUnitRow data={data} disabled={!data.drag || $isLoading} />
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Select
                    trigger="Location Type"
                    options={ungroupedTypeOptions(
                        tentacleQuestionSchema.options,
                        "locationType",
                    )}
                    groups={groupedTypeOptions(
                        tentacleQuestionSchema.options,
                        "locationType",
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
                <DrawingEnableNotice
                    subject="tentacle locations"
                    questionKey={questionKey}
                    data={data}
                    presetTypeHint="custom-tentacles"
                    disabled={!data.drag || $isLoading}
                />
            )}
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                colorName={data.color}
                onChange={applyLatLng(data)}
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
