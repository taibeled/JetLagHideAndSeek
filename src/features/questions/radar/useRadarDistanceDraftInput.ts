import {
    type RefObject,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import type { TextInput } from "react-native";

import type { QuestionState } from "@/features/questions/questionTypes";
import type {
    RadarDistanceOption,
    RadarQuestion,
} from "@/features/questions/radar/radarTypes";
import type { DistanceUnit } from "@/shared/distanceUnits";
import {
    getRadarDistanceDisplayValue,
    getRadarDistanceDisplayValueForUnit,
    updateRadarDistanceOption,
    updateRadarDistanceUnit,
    updateRadarDistanceValue,
} from "@/state/questionStore";

type RadarDistanceDraftInput = {
    customDistanceInputRef: RefObject<TextInput | null>;
    customDistanceValue: string;
    emptyDistanceHelpText: string | null;
    handleCustomDistanceChange: (value: string) => void;
    handleDistanceOptionPress: (option: RadarDistanceOption) => void;
    handleDistanceUnitPress: (unit: DistanceUnit) => void;
};

type UseRadarDistanceDraftInputParams = {
    activeQuestion: RadarQuestion;
    updateQuestion: (
        questionId: string,
        updater: (question: QuestionState) => QuestionState,
    ) => void;
};

type DraftMode = "synced" | "empty";

export function useRadarDistanceDraftInput({
    activeQuestion,
    updateQuestion,
}: UseRadarDistanceDraftInputParams): RadarDistanceDraftInput {
    const customDistanceInputRef = useRef<TextInput | null>(null);
    const draftModeRef = useRef<DraftMode>("synced");
    const draftQuestionIdRef = useRef<string | null>(null);
    const [customDistanceValue, setCustomDistanceValue] = useState("");

    useEffect(() => {
        if (activeQuestion.distanceOption !== "other") {
            draftModeRef.current = "synced";
            draftQuestionIdRef.current = activeQuestion.id;
            setCustomDistanceValue("");
            return;
        }

        if (
            draftModeRef.current === "empty" &&
            draftQuestionIdRef.current === activeQuestion.id
        ) {
            return;
        }

        draftModeRef.current = "synced";
        draftQuestionIdRef.current = activeQuestion.id;
        setCustomDistanceValue(getRadarDistanceDisplayValue(activeQuestion));
    }, [
        activeQuestion.id,
        activeQuestion.distanceMeters,
        activeQuestion.distanceOption,
        activeQuestion.distanceUnit,
    ]);

    const focusCustomDistanceInput = useCallback(() => {
        requestAnimationFrame(() => {
            customDistanceInputRef.current?.focus();
        });
    }, []);

    const handleDistanceOptionPress = useCallback(
        (option: RadarDistanceOption) => {
            updateQuestion(activeQuestion.id, (question) =>
                question.type === "radar"
                    ? updateRadarDistanceOption(question, option)
                    : question,
            );
            if (option === "other") {
                draftModeRef.current = "empty";
                draftQuestionIdRef.current = activeQuestion.id;
                setCustomDistanceValue("");
                focusCustomDistanceInput();
            }
        },
        [activeQuestion, focusCustomDistanceInput, updateQuestion],
    );

    const handleCustomDistanceChange = useCallback(
        (value: string) => {
            draftModeRef.current = value === "" ? "empty" : "synced";
            draftQuestionIdRef.current = activeQuestion.id;
            setCustomDistanceValue(value);
            updateQuestion(activeQuestion.id, (question) =>
                question.type === "radar"
                    ? updateRadarDistanceValue(question, value)
                    : question,
            );
        },
        [activeQuestion, updateQuestion],
    );

    const handleDistanceUnitPress = useCallback(
        (unit: DistanceUnit) => {
            updateQuestion(activeQuestion.id, (question) =>
                question.type === "radar"
                    ? updateRadarDistanceUnit(question, unit)
                    : question,
            );
            if (customDistanceValue !== "") {
                draftModeRef.current = "synced";
                draftQuestionIdRef.current = activeQuestion.id;
                setCustomDistanceValue(
                    getRadarDistanceDisplayValueForUnit(activeQuestion, unit),
                );
            }
        },
        [activeQuestion, customDistanceValue, updateQuestion],
    );

    const emptyDistanceHelpText =
        activeQuestion.distanceOption === "other" && customDistanceValue === ""
            ? `Using current distance ${Math.round(activeQuestion.distanceMeters)} m until a number is entered.`
            : null;

    return {
        customDistanceInputRef,
        customDistanceValue,
        emptyDistanceHelpText,
        handleCustomDistanceChange,
        handleDistanceOptionPress,
        handleDistanceUnitPress,
    };
}
