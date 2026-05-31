import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";

import type { MatchingQuestion } from "@/features/questions/matching/matchingTypes";

// Re-export for backward compatibility
export type TransitLineQuestion = MatchingQuestion;

export type TransitLineQuestionFeatureCollection = FeatureCollection<
    Polygon | MultiPolygon,
    {
        lineId: string;
    }
>;
