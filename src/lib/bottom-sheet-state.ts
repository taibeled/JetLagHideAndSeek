import { atom } from "nanostores";

export type SheetState = "collapsed" | "default" | "expanded";

/**
 * Global state atom for the bottom sheet panel.
 * - collapsed: ~80px — only handle + title visible, map fully accessible
 * - default:   ~35vh — standard state during question selection
 * - expanded:  ~75vh — full content view for long question lists
 */
export const bottomSheetState = atom<SheetState>("collapsed");

/** Controls visibility of the QuestionPickerSheet overlay */
export const pickerOpen = atom<boolean>(false);

/**
 * When QuestionPickerSheet selects a question type, it sets this atom.
 * SessionQuestionPanel watches it and calls stageQuestion() then resets to null.
 */
export const pendingPickerType = atom<string | null>(null);
