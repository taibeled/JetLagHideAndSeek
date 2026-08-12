import { useStore } from "@nanostores/react";
import * as React from "react";

import { CandidatePlayToggles } from "@/components/CandidatePlayToggles";
import { useOverpassCandidateList } from "@/hooks/use-overpass-candidate-list";
import { useTerritoryRefreshToken } from "@/hooks/use-territory-refresh-token";
import {
    displayHidingZones,
    isLoading,
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

    const supported = supportsOrdinaryFacilityOsmPicks(data.type);
    const refreshToken = useTerritoryRefreshToken(
        `${questionKey}|${supported}|${data.type}`,
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
        <CandidatePlayToggles
            candidates={candidates}
            loading={loading}
            enabled={$displayHidingZones}
            disabledOffMessage="Turn on hiding zones to load places for this territory."
            emptyMessage="No matching places found in this territory."
            heading={headingForType(data.type)}
            description="Uncheck to exclude a place from this question (OSM ref shown for disambiguation)."
            refFor={(candidate) =>
                normalizeFacilityOsmRef(
                    String(
                        (candidate.properties as { osmRef?: string })?.osmRef ??
                            "",
                    ),
                )
            }
            disabledRefs={disabledSet}
            onToggle={(osmRef, inPlay) => {
                const next = new Set(
                    (data.disabledFacilityOsmRefs ?? []).map(
                        normalizeFacilityOsmRef,
                    ),
                );
                if (inPlay) next.delete(osmRef);
                else next.add(osmRef);
                data.disabledFacilityOsmRefs = [...next].sort();
                questionModified();
            }}
            renderLabel={(osmRef, name) => (
                <>
                    <span className="text-muted-foreground">{name}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground/90">
                        {osmRef}
                    </span>
                </>
            )}
            disabled={!data.drag || $isLoading}
        />
    );
}
