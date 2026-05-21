export type SheetRouteName =
    | "main"
    | "questions"
    | "add-question"
    | "question-detail"
    | "settings"
    | "play-area"
    | "hiding-zone";

export const SHEET_SNAP_INDEX = {
    compact: 0,
    large: 2,
    medium: 1,
} as const;
