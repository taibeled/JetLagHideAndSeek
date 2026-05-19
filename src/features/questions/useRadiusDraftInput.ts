import {
    type RefObject,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import type { TextInput } from "react-native";

import type { HidingZoneUnit } from "@/features/hidingZone/hidingZoneTypes";
import type {
    RadiusOption,
    RadiusQuestion,
} from "@/features/questions/questionTypes";
import {
    getRadiusDisplayValue,
    getRadiusDisplayValueForUnit,
} from "@/state/questionStore";

type RadiusDraftInput = {
    customRadiusInputRef: RefObject<TextInput | null>;
    customRadiusValue: string;
    emptyRadiusHelpText: string | null;
    handleCustomRadiusChange: (value: string) => void;
    handleRadiusOptionPress: (option: RadiusOption) => void;
    handleRadiusUnitPress: (unit: HidingZoneUnit) => void;
};

type UseRadiusDraftInputParams = {
    activeQuestion: RadiusQuestion | null;
    setRadiusOption: (questionId: string, option: RadiusOption) => void;
    setRadiusUnit: (questionId: string, unit: HidingZoneUnit) => void;
    setRadiusValue: (questionId: string, value: string) => void;
};

type DraftMode = "synced" | "empty";

export function useRadiusDraftInput({
    activeQuestion,
    setRadiusOption,
    setRadiusUnit,
    setRadiusValue,
}: UseRadiusDraftInputParams): RadiusDraftInput {
    const customRadiusInputRef = useRef<TextInput | null>(null);
    const draftModeRef = useRef<DraftMode>("synced");
    const draftQuestionIdRef = useRef<string | null>(null);
    const [customRadiusValue, setCustomRadiusValue] = useState("");

    useEffect(() => {
        if (!activeQuestion || activeQuestion.radiusOption !== "other") {
            draftModeRef.current = "synced";
            draftQuestionIdRef.current = activeQuestion?.id ?? null;
            setCustomRadiusValue("");
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
        setCustomRadiusValue(getRadiusDisplayValue(activeQuestion));
    }, [
        activeQuestion?.id,
        activeQuestion?.radiusMeters,
        activeQuestion?.radiusOption,
        activeQuestion?.radiusUnit,
    ]);

    const focusCustomRadiusInput = useCallback(() => {
        requestAnimationFrame(() => {
            customRadiusInputRef.current?.focus();
        });
    }, []);

    const handleRadiusOptionPress = useCallback(
        (option: RadiusOption) => {
            if (!activeQuestion) return;

            setRadiusOption(activeQuestion.id, option);
            if (option === "other") {
                draftModeRef.current = "empty";
                draftQuestionIdRef.current = activeQuestion.id;
                setCustomRadiusValue("");
                focusCustomRadiusInput();
            }
        },
        [activeQuestion, focusCustomRadiusInput, setRadiusOption],
    );

    const handleCustomRadiusChange = useCallback(
        (value: string) => {
            if (!activeQuestion) return;

            draftModeRef.current = value === "" ? "empty" : "synced";
            draftQuestionIdRef.current = activeQuestion.id;
            setCustomRadiusValue(value);
            setRadiusValue(activeQuestion.id, value);
        },
        [activeQuestion, setRadiusValue],
    );

    const handleRadiusUnitPress = useCallback(
        (unit: HidingZoneUnit) => {
            if (!activeQuestion) return;

            setRadiusUnit(activeQuestion.id, unit);
            if (customRadiusValue !== "") {
                draftModeRef.current = "synced";
                draftQuestionIdRef.current = activeQuestion.id;
                setCustomRadiusValue(
                    getRadiusDisplayValueForUnit(activeQuestion, unit),
                );
            }
        },
        [activeQuestion, customRadiusValue, setRadiusUnit],
    );

    const emptyRadiusHelpText =
        activeQuestion?.radiusOption === "other" && customRadiusValue === ""
            ? `Using current radius ${Math.round(activeQuestion.radiusMeters)} m until a number is entered.`
            : null;

    return {
        customRadiusInputRef,
        customRadiusValue,
        emptyRadiusHelpText,
        handleCustomRadiusChange,
        handleRadiusOptionPress,
        handleRadiusUnitPress,
    };
}
