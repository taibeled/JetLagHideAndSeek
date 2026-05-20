import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

import type { HidingZoneUnit } from "@/features/hidingZone/hidingZoneTypes";
import { buildQuestionMapRenderState } from "@/features/questions/questionGeometry";
import { radarQuestionConfig } from "@/features/questions/radar/radarConfig";
import { fromMeters, toMeters } from "@/features/questions/radar/radarGeometry";
import {
    type ImplementedQuestionType,
    type QuestionAnswer,
    type QuestionState,
    type QuestionsImportState,
} from "@/features/questions/questionTypes";
import {
    type QuestionMapRenderState,
    type RadarDistanceOption,
    type RadarQuestion,
    radarDistanceOptionMeters,
} from "@/features/questions/radar/radarTypes";
import type { Position } from "@/features/map/geojsonTypes";

type QuestionStateValue = {
    activeQuestion: QuestionState | null;
    activeQuestionId: string | null;
    createQuestion: (
        type: ImplementedQuestionType,
        options: { center: Position },
    ) => QuestionState;
    deleteQuestion: (questionId: string) => void;
    importQuestions: (questions: QuestionsImportState) => void;
    importQuestionSettings: (settings: QuestionSettingsImportState) => void;
    isPinLocked: boolean;
    isQuestionSheetActive: boolean;
    isRestored: boolean;
    markRestored: () => void;
    questionMapRenderState: QuestionMapRenderState;
    questions: QuestionState[];
    setActiveQuestionId: (questionId: string | null) => void;
    setPinLocked: (isLocked: boolean) => void;
    setQuestionSheetActive: (isActive: boolean) => void;
    updateQuestion: (
        questionId: string,
        updater: (question: QuestionState) => QuestionState,
    ) => void;
};

export type QuestionSettingsImportState = {
    isPinLocked: boolean;
};

const QuestionContext = createContext<QuestionStateValue | null>(null);

export function QuestionProvider({ children }: { children: ReactNode }) {
    const [questions, setQuestions] = useState<QuestionState[]>([]);
    const [activeQuestionId, setActiveQuestionIdState] = useState<
        string | null
    >(null);
    const [isQuestionSheetActive, setQuestionSheetActiveState] =
        useState(false);
    const [isPinLocked, setPinLockedState] = useState(false);
    const [isRestored, setIsRestored] = useState(false);

    const activeQuestion = useMemo(
        () =>
            questions.find((question) => question.id === activeQuestionId) ??
            null,
        [activeQuestionId, questions],
    );
    const questionMapRenderState = useMemo(
        () => buildQuestionMapRenderState(questions),
        [questions],
    );

    const updateQuestion = useCallback(
        (
            questionId: string,
            updater: (question: QuestionState) => QuestionState,
        ) => {
            setQuestions((current) =>
                current.map((question) =>
                    question.id === questionId ? updater(question) : question,
                ),
            );
        },
        [],
    );

    const createQuestion = useCallback(
        (type: ImplementedQuestionType, options: { center: Position }) => {
            const now = new Date().toISOString();
            const question = createDefaultQuestion(type, options.center, now);
            setQuestions((current) => [...current, question]);
            setActiveQuestionIdState(question.id);
            setQuestionSheetActiveState(true);
            return question;
        },
        [],
    );

    const deleteQuestion = useCallback((questionId: string) => {
        setQuestions((current) => {
            if (!current.some((question) => question.id === questionId)) {
                return current;
            }
            return current.filter((question) => question.id !== questionId);
        });
        setActiveQuestionIdState((current) =>
            current === questionId ? null : current,
        );
    }, []);

    const importQuestions = useCallback(
        (nextQuestions: QuestionsImportState) => {
            setQuestions(nextQuestions.map(normalizeQuestionState));
            setActiveQuestionIdState(null);
        },
        [],
    );

    const setActiveQuestionId = useCallback((questionId: string | null) => {
        setActiveQuestionIdState(questionId);
    }, []);

    const setQuestionSheetActive = useCallback((isActive: boolean) => {
        setQuestionSheetActiveState(isActive);
    }, []);

    const setPinLocked = useCallback((isLocked: boolean) => {
        setPinLockedState(isLocked);
    }, []);

    const importQuestionSettings = useCallback(
        (settings: QuestionSettingsImportState) => {
            setPinLockedState(settings.isPinLocked);
        },
        [],
    );

    const markRestored = useCallback(() => {
        setIsRestored(true);
    }, []);

    const value = useMemo<QuestionStateValue>(
        () => ({
            activeQuestion,
            activeQuestionId,
            createQuestion,
            deleteQuestion,
            importQuestionSettings,
            importQuestions,
            isPinLocked,
            isQuestionSheetActive,
            isRestored,
            markRestored,
            questionMapRenderState,
            questions,
            setActiveQuestionId,
            setPinLocked,
            setQuestionSheetActive,
            updateQuestion,
        }),
        [
            activeQuestion,
            activeQuestionId,
            createQuestion,
            deleteQuestion,
            importQuestionSettings,
            importQuestions,
            isPinLocked,
            isQuestionSheetActive,
            isRestored,
            markRestored,
            questionMapRenderState,
            questions,
            setActiveQuestionId,
            setPinLocked,
            setQuestionSheetActive,
            updateQuestion,
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

export function getRadarDistanceDisplayValue(question: RadarQuestion): string {
    return fromMeters(question.distanceMeters, question.distanceUnit);
}

export function getRadarDistanceDisplayValueForUnit(
    question: RadarQuestion,
    unit: HidingZoneUnit,
): string {
    return fromMeters(question.distanceMeters, unit);
}

export function updateRadarQuestionCenter(
    question: QuestionState,
    center: Position,
): QuestionState {
    if (question.type !== "radar") return question;
    return {
        ...question,
        center,
        updatedAt: new Date().toISOString(),
    };
}

export function updateRadarAnswer(
    question: RadarQuestion,
    answer: QuestionAnswer,
): RadarQuestion {
    return {
        ...question,
        answer,
        updatedAt: new Date().toISOString(),
    };
}

export function updateRadarDistanceOption(
    question: RadarQuestion,
    option: RadarDistanceOption,
): RadarQuestion {
    const now = new Date().toISOString();
    if (option === "other") {
        return {
            ...question,
            distanceOption: option,
            updatedAt: now,
        };
    }
    return {
        ...question,
        distanceMeters: radarDistanceOptionMeters[option],
        distanceOption: option,
        distanceUnit: "m",
        updatedAt: now,
    };
}

export function updateRadarDistanceValue(
    question: RadarQuestion,
    value: string,
): RadarQuestion {
    const meters = toMeters(value, question.distanceUnit);
    if (meters === null) return question;
    return {
        ...question,
        distanceMeters: meters,
        distanceOption: "other",
        updatedAt: new Date().toISOString(),
    };
}

export function updateRadarDistanceUnit(
    question: RadarQuestion,
    unit: HidingZoneUnit,
): RadarQuestion {
    return {
        ...question,
        distanceOption: "other",
        distanceUnit: unit,
        updatedAt: new Date().toISOString(),
    };
}

function createQuestionId(): string {
    return `q-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

function createDefaultQuestion(
    type: ImplementedQuestionType,
    center: Position,
    now: string,
): QuestionState {
    switch (type) {
        case "radar":
            return {
                answer: radarQuestionConfig.defaultAnswer,
                center,
                createdAt: now,
                distanceMeters: radarDistanceOptionMeters["500m"],
                distanceOption: "500m",
                distanceUnit: "m",
                id: createQuestionId(),
                type: "radar",
                updatedAt: now,
            };
    }
}

function normalizeQuestionState(question: unknown): QuestionState {
    if (isLegacyRadiusQuestion(question)) {
        return {
            center: question.center,
            createdAt: question.createdAt,
            answer: "unanswered",
            distanceMeters: question.radiusMeters,
            distanceOption: question.radiusOption,
            distanceUnit: question.radiusUnit,
            id: question.id,
            type: "radar",
            updatedAt: question.updatedAt,
        };
    }
    if (isRadarQuestionWithoutAnswer(question)) {
        return {
            ...question,
            answer: "unanswered",
        };
    }
    return question as QuestionState;
}

function isLegacyRadiusQuestion(value: unknown): value is {
    center: Position;
    createdAt: string;
    id: string;
    radiusMeters: number;
    radiusOption: RadarDistanceOption;
    radiusUnit: HidingZoneUnit;
    type: "radius";
    updatedAt: string;
} {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "radius"
    );
}

function isRadarQuestionWithoutAnswer(
    value: unknown,
): value is Omit<RadarQuestion, "answer"> {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "radar" &&
        !("answer" in value)
    );
}
