import { useStore } from "@nanostores/react";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { useOverpassCandidateList } from "@/hooks/use-overpass-candidate-list";
import {
    additionalMapGeoLocations,
    displayHidingZones,
    isLoading,
    mapGeoLocation,
    polyGeoJSON,
    questionModified,
} from "@/lib/context";
import { prettifyLocation } from "@/maps/api";
import {
    listOrdinaryFacilityVoronoiCandidates,
    normalizeFacilityOsmRef,
    supportsOrdinaryFacilityOsmPicks,
} from "@/maps/questions/facility-full";
import type { APILocations } from "@/maps/schema";

function headingForType(type: string): string {
    if (type === "major-city" || type === "city") {
        return "Cities in play (1M+)";
    }
    if (type === "hospital-nyc-full") {
        return "Hospitals in play (NYC curated list)";
    }
    if (type.endsWith("-full")) {
        const loc = type.replace("-full", "") as APILocations;
        return `${prettifyLocation(loc, true)} in play`;
    }
    return "Places in play";
}

export function FacilityOsmPlayToggles({
    data,
    questionKey,
}: {
    data: {
        type: string;
        disabledFacilityOsmRefs?: string[];
        drag: boolean;
    };
    questionKey: number;
}) {
    const $displayHidingZones = useStore(displayHidingZones);
    const $isLoading = useStore(isLoading);
    const $polyGeo = useStore(polyGeoJSON);
    const $mapLoc = useStore(mapGeoLocation);
    const $additional = useStore(additionalMapGeoLocations);

    const supported = supportsOrdinaryFacilityOsmPicks(data.type);
    const refreshToken = React.useMemo(
        () => ({
            questionKey,
            supported,
            type: data.type,
            poly: $polyGeo,
            map: $mapLoc,
            additional: $additional,
        }),
        [questionKey, supported, data.type, $polyGeo, $mapLoc, $additional],
    );
    const loadCandidates = React.useCallback(
        () => listOrdinaryFacilityVoronoiCandidates(data),
        [data],
    );

    const { items: candidates, loading } = useOverpassCandidateList(
        supported && $displayHidingZones,
        loadCandidates,
        refreshToken,
    );

    const disabledSet = new Set(
        (data.disabledFacilityOsmRefs ?? []).map(normalizeFacilityOsmRef),
    );

    if (!supported) return null;

    return (
        <SidebarMenuItem
            className={`${MENU_ITEM_CLASSNAME} flex-col items-stretch gap-2`}
        >
            {!$displayHidingZones ? (
                <p className="text-xs text-muted-foreground px-1">
                    Turn on hiding zones to load places for this territory.
                </p>
            ) : loading ? (
                <div className="flex justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
            ) : candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">
                    No matching places found in this territory.
                </p>
            ) : (
                <>
                    <Label className="text-xs font-semibold">
                        {headingForType(data.type)}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                        Uncheck to exclude a place from this question (OSM ref
                        shown for disambiguation).
                    </p>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-md border border-border p-2">
                        {[...candidates]
                            .sort((a, b) =>
                                String(
                                    (a.properties as { name?: string })?.name ??
                                        "",
                                ).localeCompare(
                                    String(
                                        (b.properties as { name?: string })
                                            ?.name ?? "",
                                    ),
                                ),
                            )
                            .map((pt) => {
                                const osmRef = normalizeFacilityOsmRef(
                                    String(
                                        (pt.properties as { osmRef?: string })
                                            ?.osmRef ?? "",
                                    ),
                                );
                                const name =
                                    (pt.properties as { name?: string })
                                        ?.name ?? osmRef;
                                const inPlay = !disabledSet.has(osmRef);
                                return (
                                    <label
                                        key={osmRef}
                                        className="flex cursor-pointer items-start gap-2 text-xs"
                                    >
                                        <Checkbox
                                            className="mt-0.5"
                                            checked={inPlay}
                                            onCheckedChange={(v) => {
                                                const next = new Set(
                                                    (
                                                        data.disabledFacilityOsmRefs ??
                                                        []
                                                    ).map(
                                                        normalizeFacilityOsmRef,
                                                    ),
                                                );
                                                if (v === true)
                                                    next.delete(osmRef);
                                                else next.add(osmRef);
                                                data.disabledFacilityOsmRefs = [
                                                    ...next,
                                                ].sort();
                                                questionModified();
                                            }}
                                            disabled={!data.drag || $isLoading}
                                        />
                                        <span className="min-w-0 leading-snug">
                                            <span className="text-muted-foreground">
                                                {name}
                                            </span>
                                            <span className="block font-mono text-[10px] text-muted-foreground/90">
                                                {osmRef}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })}
                    </div>
                </>
            )}
        </SidebarMenuItem>
    );
}
