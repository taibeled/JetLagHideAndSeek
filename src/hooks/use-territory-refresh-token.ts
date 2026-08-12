import { useStore } from "@nanostores/react";
import * as React from "react";

import {
    additionalMapGeoLocations,
    mapGeoLocation,
    polyGeoJSON,
} from "@/lib/context";

/**
 * Identity for a territory-scoped Overpass list: a new object whenever the
 * played territory changes, or when `questionKey` — a caller-built string
 * covering the question's own inputs — changes. Pass it to
 * `useOverpassCandidateList` as the refresh token.
 */
export function useTerritoryRefreshToken(questionKey: string) {
    const $polyGeo = useStore(polyGeoJSON);
    const $mapLoc = useStore(mapGeoLocation);
    const $additional = useStore(additionalMapGeoLocations);

    return React.useMemo(
        () => ({
            questionKey,
            poly: $polyGeo,
            map: $mapLoc,
            additional: $additional,
        }),
        [questionKey, $polyGeo, $mapLoc, $additional],
    );
}
