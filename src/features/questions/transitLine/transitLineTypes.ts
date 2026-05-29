import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";

import type { Position } from "@/features/map/geojsonTypes";
import type {
    BaseQuestion,
    QuestionAnswer,
} from "@/features/questions/questionTypes";

export type TransitLineQuestion = BaseQuestion & {
    answer: QuestionAnswer;
    center: Position;
    lineId: string | null;
    lineName: string | null;
    type: "matching";
};

export type TransitLineQuestionFeatureCollection = FeatureCollection<
    Polygon | MultiPolygon,
    {
        lineId: string;
    }
>;
