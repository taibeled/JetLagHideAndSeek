import { point } from "@turf/helpers";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";

import type { Bbox } from "@/features/map/geojsonTypes";
import type { QuestionState } from "@/features/questions/questionTypes";
import {
    buildOsmMatchingHitMask,
    buildOsmMatchingMissMask,
    computeVoronoiCells,
    makeOsmKey,
} from "@/features/questions/matching/matchingVoronoi";

export type OsmMatchingPoiFeature = FeatureCollection<
    Point,
    { isSelected: boolean; name: string; osmId: number }
>;

export type OsmMatchingRenderState = {
    hitMaskFeatures: FeatureCollection<Polygon | MultiPolygon>;
    missMaskFeatures: FeatureCollection<Polygon | MultiPolygon>;
    poiFeatures: OsmMatchingPoiFeature;
};

export function buildOsmMatchingRenderState(
    questions: QuestionState[],
    playAreaBbox: Bbox,
): OsmMatchingRenderState {
    const osmMatchingQuestions = questions.filter(
        (q): q is Extract<QuestionState, { type: "matching" }> =>
            q.type === "matching" &&
            q.category !== "transit-line" &&
            q.targetOsmId !== null &&
            q.candidates.length > 0,
    );

    if (osmMatchingQuestions.length === 0) {
        return {
            hitMaskFeatures: { features: [], type: "FeatureCollection" },
            missMaskFeatures: { features: [], type: "FeatureCollection" },
            poiFeatures: { features: [], type: "FeatureCollection" },
        };
    }

    const hitFeatures: Feature<Polygon | MultiPolygon>[] = [];
    const missFeatures: Feature<Polygon | MultiPolygon>[] = [];
    const poiFeatures: OsmMatchingPoiFeature["features"] = [];

    for (const question of osmMatchingQuestions) {
        const cells = computeVoronoiCells(question.candidates, playAreaBbox);
        const selectedOsmKey =
            question.selectedOsmType !== null && question.selectedOsmId !== null
                ? makeOsmKey(question.selectedOsmType, question.selectedOsmId)
                : null;

        if (question.answer === "positive") {
            const hitMask = buildOsmMatchingHitMask(cells, selectedOsmKey);
            hitFeatures.push(...hitMask.features);
        } else if (question.answer === "negative") {
            const missMask = buildOsmMatchingMissMask(cells, selectedOsmKey);
            missFeatures.push(...missMask.features);
        }

        for (const candidate of question.candidates) {
            const isSelected =
                question.selectedOsmId === candidate.osmId &&
                question.selectedOsmType === candidate.osmType;
            poiFeatures.push(
                point([candidate.lon, candidate.lat], {
                    isSelected,
                    name: candidate.name,
                    osmId: candidate.osmId,
                }),
            );
        }
    }

    return {
        hitMaskFeatures: { features: hitFeatures, type: "FeatureCollection" },
        missMaskFeatures: {
            features: missFeatures,
            type: "FeatureCollection",
        },
        poiFeatures: { features: poiFeatures, type: "FeatureCollection" },
    };
}
