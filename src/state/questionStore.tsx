import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

import type { HidingZoneUnit } from "@/features/hidingZone/hidingZoneTypes";
import {
    buildRadiusQuestionFeatureCollection,
    fromMeters,
    toMeters,
} from "@/features/questions/questionGeometry";
import {
    type QuestionState,
    type QuestionsImportState,
    type RadiusOption,
    type RadiusQuestion,
    type RadiusQuestionFeatureCollection,
    radiusOptionMeters,
} from "@/features/questions/questionTypes";
import type { Position } from "@/features/map/geojsonTypes";

type QuestionStateValue = {
    activeQuestion: RadiusQuestion | null;
    activeQuestionId: string | null;
    createRadiusQuestion: (center: Position) => RadiusQuestion;
    importQuestions: (questions: QuestionsImportState) => void;
    isMovePinEnabled: boolean;
    isQuestionSheetActive: boolean;
    isRestored: boolean;
    markRestored: () => void;
    questions: QuestionState[];
    radiusFeatures: RadiusQuestionFeatureCollection;
    setActiveQuestionId: (questionId: string | null) => void;
    setMovePinEnabled: (enabled: boolean) => void;
    setQuestionCenter: (questionId: string, center: Position) => void;
    setQuestionSheetActive: (isActive: boolean) => void;
    setRadiusOption: (questionId: string, option: RadiusOption) => void;
    setRadiusUnit: (questionId: string, unit: HidingZoneUnit) => void;
    setRadiusValue: (questionId: string, value: string) => void;
};

const QuestionContext = createContext<QuestionStateValue | null>(null);

export function QuestionProvider({ children }: { children: ReactNode }) {
    const [questions, setQuestions] = useState<QuestionState[]>([]);
    const [activeQuestionId, setActiveQuestionIdState] = useState<
        string | null
    >(null);
    const [isQuestionSheetActive, setQuestionSheetActiveState] =
        useState(false);
    const [isMovePinEnabled, setMovePinEnabledState] = useState(false);
    const [isRestored, setIsRestored] = useState(false);

    const activeQuestion = useMemo(
        () =>
            questions.find((question) => question.id === activeQuestionId) ??
            null,
        [activeQuestionId, questions],
    );
    const radiusFeatures = useMemo(
        () => buildRadiusQuestionFeatureCollection(questions),
        [questions],
    );

    const updateQuestion = useCallback(
        (
            questionId: string,
            updater: (question: RadiusQuestion) => RadiusQuestion,
        ) => {
            setQuestions((current) =>
                current.map((question) =>
                    question.id === questionId ? updater(question) : question,
                ),
            );
        },
        [],
    );

    const createRadiusQuestion = useCallback((center: Position) => {
        const now = new Date().toISOString();
        const question: RadiusQuestion = {
            center,
            createdAt: now,
            id: createQuestionId(),
            radiusMeters: radiusOptionMeters["500m"],
            radiusOption: "500m",
            radiusUnit: "m",
            type: "radius",
            updatedAt: now,
        };
        setQuestions((current) => [...current, question]);
        setActiveQuestionIdState(question.id);
        setQuestionSheetActiveState(true);
        setMovePinEnabledState(false);
        return question;
    }, []);

    const importQuestions = useCallback(
        (nextQuestions: QuestionsImportState) => {
            setQuestions(nextQuestions);
            setActiveQuestionIdState(null);
            setMovePinEnabledState(false);
        },
        [],
    );

    const setActiveQuestionId = useCallback((questionId: string | null) => {
        setActiveQuestionIdState(questionId);
        setMovePinEnabledState(false);
    }, []);

    const setQuestionSheetActive = useCallback((isActive: boolean) => {
        setQuestionSheetActiveState(isActive);
        if (!isActive) setMovePinEnabledState(false);
    }, []);

    const setMovePinEnabled = useCallback((enabled: boolean) => {
        setMovePinEnabledState(enabled);
    }, []);

    const setQuestionCenter = useCallback(
        (questionId: string, center: Position) => {
            updateQuestion(questionId, (question) => ({
                ...question,
                center,
                updatedAt: new Date().toISOString(),
            }));
        },
        [updateQuestion],
    );

    const setRadiusOption = useCallback(
        (questionId: string, option: RadiusOption) => {
            updateQuestion(questionId, (question) => {
                const now = new Date().toISOString();
                if (option === "other") {
                    return {
                        ...question,
                        radiusOption: option,
                        updatedAt: now,
                    };
                }
                return {
                    ...question,
                    radiusMeters: radiusOptionMeters[option],
                    radiusOption: option,
                    radiusUnit: "m",
                    updatedAt: now,
                };
            });
        },
        [updateQuestion],
    );

    const setRadiusValue = useCallback(
        (questionId: string, value: string) => {
            updateQuestion(questionId, (question) => {
                const meters = toMeters(value, question.radiusUnit);
                if (meters === null) return question;
                return {
                    ...question,
                    radiusMeters: meters,
                    radiusOption: "other",
                    updatedAt: new Date().toISOString(),
                };
            });
        },
        [updateQuestion],
    );

    const setRadiusUnit = useCallback(
        (questionId: string, unit: HidingZoneUnit) => {
            updateQuestion(questionId, (question) => ({
                ...question,
                radiusOption: "other",
                radiusUnit: unit,
                updatedAt: new Date().toISOString(),
            }));
        },
        [updateQuestion],
    );

    const markRestored = useCallback(() => {
        setIsRestored(true);
    }, []);

    const value = useMemo<QuestionStateValue>(
        () => ({
            activeQuestion,
            activeQuestionId,
            createRadiusQuestion,
            importQuestions,
            isMovePinEnabled,
            isQuestionSheetActive,
            isRestored,
            markRestored,
            questions,
            radiusFeatures,
            setActiveQuestionId,
            setMovePinEnabled,
            setQuestionCenter,
            setQuestionSheetActive,
            setRadiusOption,
            setRadiusUnit,
            setRadiusValue,
        }),
        [
            activeQuestion,
            activeQuestionId,
            createRadiusQuestion,
            importQuestions,
            isMovePinEnabled,
            isQuestionSheetActive,
            isRestored,
            markRestored,
            questions,
            radiusFeatures,
            setActiveQuestionId,
            setMovePinEnabled,
            setQuestionCenter,
            setQuestionSheetActive,
            setRadiusOption,
            setRadiusUnit,
            setRadiusValue,
        ],
    );

    return (
        <QuestionContext.Provider value={value}>
            {children}
        </QuestionContext.Provider>
    );
}

export function useQuestion() {
    const context = useContext(QuestionContext);
    if (!context) {
        throw new Error("useQuestion must be used within QuestionProvider.");
    }
    return context;
}

export function getRadiusDisplayValue(question: RadiusQuestion): string {
    return fromMeters(question.radiusMeters, question.radiusUnit);
}

function createQuestionId(): string {
    return `q-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}
