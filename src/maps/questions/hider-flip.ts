import * as turf from "@turf/turf";

import { nearestToQuestion } from "@/maps/api";
import { holedMask } from "@/maps/geo-utils";

/**
 * For the hiding-zone facility questions: the facility nearest the seeker and
 * the one nearest the hider. `answerExtras` supplies whichever answer field
 * that question kind requires (`same`, `hiderCloser`, …), since
 * `nearestToQuestion` takes a whole question.
 *
 * Sequential on purpose — the two lookups share the Overpass cache and its
 * loading toast.
 */
export const nearestForSeekerAndHider = async (
    question: any,
    hider: { latitude: number; longitude: number },
    answerExtras: Record<string, unknown>,
) => {
    const seekerNearest = await nearestToQuestion(question);
    const hiderNearest = await nearestToQuestion({
        lat: hider.latitude,
        lng: hider.longitude,
        ...answerExtras,
        type: question.type,
        drag: false,
        color: "black",
        collapsed: false,
    } as any);

    return { seekerNearest, hiderNearest };
};

/**
 * Shared tail of `hiderifyMatching` / `hiderifyMeasuring`: apply the question's
 * own map adjustment, then report whether the hider ended up inside the area
 * that answer eliminates — in which case the stored answer must be inverted.
 *
 * Returns false whenever the geometry cannot be built, leaving the answer as-is.
 */
export const hiderInsideEliminatedArea = async (
    mapData: any,
    hider: { latitude: number; longitude: number },
    adjust: (mapData: any) => Promise<any>,
): Promise<boolean> => {
    let feature;

    try {
        feature = holedMask((await adjust(mapData))!);
    } catch {
        try {
            const maskedMap = holedMask(mapData);
            if (!maskedMap) return false;
            feature = await adjust({
                type: "FeatureCollection",
                features: [maskedMap],
            });
        } catch {
            return false;
        }
    }

    if (feature === null || feature === undefined) return false;

    return turf.booleanPointInPolygon(
        turf.point([hider.longitude, hider.latitude]),
        feature,
    );
};
