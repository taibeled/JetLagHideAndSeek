import type { Position } from "@/shared/geojson";
import type {
    BaseQuestion,
    QuestionAnswer,
} from "@/features/questions/coreTypes";

export type MatchingCategory =
    | "transit-line"
    | "commercial-airport"
    | "admin-1st"
    | "admin-2nd"
    | "admin-3rd"
    | "admin-4th"
    | "mountain"
    | "landmark"
    | "park"
    | "amusement-park"
    | "zoo"
    | "aquarium"
    | "golf-course"
    | "museum"
    | "movie-theater"
    | "hospital"
    | "library"
    | "foreign-consulate";

export type MatchingQuestion = BaseQuestion & {
    answer: QuestionAnswer;
    candidates: (OsmFeature & { distanceMeters?: number })[];
    category: MatchingCategory;
    center: Position;
    lineId: string | null;
    lineName: string | null;
    selectedOsmId: number | null;
    selectedOsmType: "node" | "way" | "relation" | null;
    targetName: string | null;
    targetOsmId: number | null;
    targetOsmType: "node" | "way" | "relation" | null;
    type: "matching";
};

export type OsmFeature = {
    lat: number;
    lon: number;
    name: string;
    osmId: number;
    osmType: "node" | "way" | "relation";
    tags: Record<string, string>;
};
