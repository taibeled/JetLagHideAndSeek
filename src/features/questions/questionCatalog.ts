import type {
    ImplementedQuestionType,
    QuestionState,
    QuestionType,
} from "@/features/questions/questionTypes";

export type QuestionDefinition = {
    cost: string;
    detail: string;
    implemented: boolean;
    listTitle: string;
    mapBehavior: {
        usesMovableAnchor: boolean;
    };
    summary: (question: QuestionState, index: number) => string;
    time: string;
    title: string;
    type: QuestionType;
};

export const questionDefinitions = {
    matching: {
        cost: "Draw 2, pick 1",
        detail: "Compare nearest places or boundaries.",
        implemented: false,
        listTitle: "Matching",
        mapBehavior: { usesMovableAnchor: false },
        summary: () => "Not yet implemented",
        time: "5 minutes",
        title: "Matching",
        type: "matching",
    },
    measuring: {
        cost: "Draw 3, pick 1",
        detail: "Compare distance to a selected place or boundary.",
        implemented: false,
        listTitle: "Measuring",
        mapBehavior: { usesMovableAnchor: false },
        summary: () => "Not yet implemented",
        time: "5 minutes",
        title: "Measuring",
        type: "measuring",
    },
    radar: {
        cost: "Draw 2, pick 1",
        detail: "Ask whether the hider is within a distance of you.",
        implemented: true,
        listTitle: "Radar",
        mapBehavior: { usesMovableAnchor: true },
        summary: (question) =>
            question.type === "radar"
                ? `${Math.round(question.distanceMeters)} m distance`
                : "",
        time: "5 minutes",
        title: "Radar Question",
        type: "radar",
    },
    tentacles: {
        cost: "Draw 4, pick 2",
        detail: "Find the closest qualifying place within range.",
        implemented: false,
        listTitle: "Tentacles",
        mapBehavior: { usesMovableAnchor: true },
        summary: () => "Not yet implemented",
        time: "5 minutes",
        title: "Tentacles",
        type: "tentacles",
    },
    thermometer: {
        cost: "Draw 2, pick 1",
        detail: "Compare whether movement is hotter or colder.",
        implemented: false,
        listTitle: "Thermometer",
        mapBehavior: { usesMovableAnchor: false },
        summary: () => "Not yet implemented",
        time: "5 minutes",
        title: "Thermometer",
        type: "thermometer",
    },
} satisfies Record<QuestionType, QuestionDefinition>;

export const implementedQuestionTypes: ImplementedQuestionType[] = ["radar"];

export function getQuestionDefinition(type: QuestionType): QuestionDefinition {
    return questionDefinitions[type];
}
