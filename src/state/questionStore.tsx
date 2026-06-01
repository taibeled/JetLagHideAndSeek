import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

import type { MatchingCategory } from "@/features/questions/matching/matchingTypes";
import { radarQuestionConfig } from "@/features/questions/radar/radarConfig";
import {
    type ImplementedQuestionType,
    type QuestionAnswer,
    type QuestionState,
    type QuestionsImportState,
} from "@/features/questions/questionTypes";
import {
    type RadarDistanceOption,
    type RadarQuestion,
    radarDistanceOptionMeters,
} from "@/features/questions/radar/radarTypes";
import { normalizeTransitLineQuestion } from "@/features/questions/transitLine/transitLineNormalization";
import type { Position } from "@/shared/geojson";
import {
    fromMeters,
    toMeters,
    type DistanceUnit,
} from "@/shared/distanceUnits";

// ---------------------------------------------------------------------------
// State context — scalar values that change frequently
// ---------------------------------------------------------------------------

type QuestionStateValue = {
    activeQuestionId: string | null;
    isPinLocked: boolean;
    isRestored: boolean;
};

const QuestionStateContext = createContext<QuestionStateValue | null>(null);

export function useQuestionState(): QuestionStateValue {
    const context = useContext(QuestionStateContext);
    if (!context) {
        throw new Error(
            "useQuestionState must be used within QuestionProvider.",
        );
    }
    return context;
}

// ---------------------------------------------------------------------------
// Granular subscriptions — prevent re-renders for consumers that only need a
// scalar value or stable question ordering.
// ---------------------------------------------------------------------------

const IsPinLockedContext = createContext<boolean>(false);
const QuestionIdsContext = createContext<string[] | null>(null);
const QuestionsByIdContext = createContext<Record<
    string,
    QuestionState
> | null>(null);

/**
 * Subscribe to `isPinLocked` without receiving the full `questions` array.
 * Use this in components that only need to know whether the active pin is
 * locked, so they don't re-render on every question edit.
 */
export function useIsPinLocked(): boolean {
    return useContext(IsPinLockedContext);
}

export function useQuestionIds(): string[] {
    const context = useContext(QuestionIdsContext);
    if (!context) {
        throw new Error("useQuestionIds must be used within QuestionProvider.");
    }
    return context;
}

export function useQuestions(): QuestionState[] {
    const questionIds = useQuestionIds();
    const questionsById = useContext(QuestionsByIdContext);
    if (!questionsById) {
        throw new Error("useQuestions must be used within QuestionProvider.");
    }

    return useMemo(
        () => questionIds.map((questionId) => questionsById[questionId]),
        [questionIds, questionsById],
    );
}

// ---------------------------------------------------------------------------
// Actions context — stable callbacks
// ---------------------------------------------------------------------------

type QuestionActionsValue = {
    createQuestion: (
        type: ImplementedQuestionType,
        options: { center: Position; category?: MatchingCategory },
    ) => QuestionState;
    deleteQuestion: (questionId: string) => void;
    importQuestionSettings: (settings: QuestionSettingsImportState) => void;
    importQuestions: (questions: QuestionsImportState) => void;
    markRestored: () => void;
    setActiveQuestionId: (questionId: string | null) => void;
    setPinLocked: (isLocked: boolean) => void;
    updateQuestion: (
        questionId: string,
        updater: (question: QuestionState) => QuestionState,
    ) => void;
};

const QuestionActionsContext = createContext<QuestionActionsValue | null>(null);

export function useQuestionActions(): QuestionActionsValue {
    const context = useContext(QuestionActionsContext);
    if (!context) {
        throw new Error(
            "useQuestionActions must be used within QuestionProvider.",
        );
    }
    return context;
}

// ---------------------------------------------------------------------------
// Derived context — computed values derived from state
// ---------------------------------------------------------------------------

type QuestionDerivedValue = {
    activeQuestion: QuestionState | null;
};

const QuestionDerivedContext = createContext<QuestionDerivedValue | null>(null);

export function useQuestionDerived(): QuestionDerivedValue {
    const context = useContext(QuestionDerivedContext);
    if (!context) {
        throw new Error(
            "useQuestionDerived must be used within QuestionProvider.",
        );
    }
    return context;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export type QuestionSettingsImportState = {
    activeQuestionId: string | null;
    isPinLocked: boolean;
};

type NormalizedQuestions = {
    allIds: string[];
    byId: Record<string, QuestionState>;
};

const emptyQuestions: NormalizedQuestions = {
    allIds: [],
    byId: createQuestionsById(),
};

export function QuestionProvider({ children }: { children: ReactNode }) {
    const [questions, setQuestions] =
        useState<NormalizedQuestions>(emptyQuestions);
    const [activeQuestionId, setActiveQuestionIdState] = useState<
        string | null
    >(null);
    const [isPinLocked, setPinLockedState] = useState(false);
    const [isRestored, setIsRestored] = useState(false);

    const activeQuestion = useMemo(
        () =>
            activeQuestionId
                ? (questions.byId[activeQuestionId] ?? null)
                : null,
        [activeQuestionId, questions.byId],
    );

    const updateQuestion = useCallback(
        (
            questionId: string,
            updater: (question: QuestionState) => QuestionState,
        ) => {
            setQuestions((current) => {
                const question = current.byId[questionId];
                if (!question) return current;

                const updatedQuestion = updater(question);
                if (updatedQuestion === question) return current;
                if (updatedQuestion.id !== question.id) {
                    throw new Error(
                        "updateQuestion cannot change a question id.",
                    );
                }

                const byId = cloneQuestionsById(current.byId);
                byId[questionId] = updatedQuestion;
                return {
                    ...current,
                    byId,
                };
            });
        },
        [],
    );

    const createQuestion = useCallback(
        (
            type: ImplementedQuestionType,
            options: { center: Position; category?: MatchingCategory },
        ) => {
            const now = new Date().toISOString();
            const question = createDefaultQuestion(
                type,
                options.center,
                now,
                options.category,
            );
            setQuestions((current) => {
                const byId = cloneQuestionsById(current.byId);
                byId[question.id] = question;
                return {
                    allIds: [...current.allIds, question.id],
                    byId,
                };
            });
            setActiveQuestionIdState(question.id);
            return question;
        },
        [],
    );

    const deleteQuestion = useCallback((questionId: string) => {
        setQuestions((current) => {
            if (!hasQuestionId(current.byId, questionId)) return current;

            const byId = cloneQuestionsById(current.byId);
            delete byId[questionId];
            return {
                allIds: current.allIds.filter((id) => id !== questionId),
                byId,
            };
        });
        setActiveQuestionIdState((current) =>
            current === questionId ? null : current,
        );
    }, []);

    const importQuestions = useCallback(
        (nextQuestions: QuestionsImportState) => {
            setQuestions(
                normalizeQuestions(nextQuestions.map(normalizeQuestionState)),
            );
            setActiveQuestionIdState(null);
        },
        [],
    );

    const setActiveQuestionId = useCallback((questionId: string | null) => {
        setActiveQuestionIdState(questionId);
    }, []);

    const setPinLocked = useCallback((isLocked: boolean) => {
        setPinLockedState(isLocked);
    }, []);

    const importQuestionSettings = useCallback(
        (settings: QuestionSettingsImportState) => {
            setPinLockedState(settings.isPinLocked);
            setActiveQuestionIdState(settings.activeQuestionId);
        },
        [],
    );

    const markRestored = useCallback(() => {
        setIsRestored(true);
    }, []);

    const stateValue = useMemo<QuestionStateValue>(
        () => ({
            activeQuestionId,
            isPinLocked,
            isRestored,
        }),
        [activeQuestionId, isPinLocked, isRestored],
    );

    const actionsValue = useMemo<QuestionActionsValue>(
        () => ({
            createQuestion,
            deleteQuestion,
            importQuestionSettings,
            importQuestions,
            markRestored,
            setActiveQuestionId,
            setPinLocked,
            updateQuestion,
        }),
        [
            createQuestion,
            deleteQuestion,
            importQuestionSettings,
            importQuestions,
            markRestored,
            setActiveQuestionId,
            setPinLocked,
            updateQuestion,
        ],
    );

    const derivedValue = useMemo<QuestionDerivedValue>(
        () => ({
            activeQuestion,
        }),
        [activeQuestion],
    );

    return (
        <QuestionStateContext.Provider value={stateValue}>
            <QuestionActionsContext.Provider value={actionsValue}>
                <QuestionDerivedContext.Provider value={derivedValue}>
                    <QuestionIdsContext.Provider value={questions.allIds}>
                        <QuestionsByIdContext.Provider value={questions.byId}>
                            <IsPinLockedContext.Provider value={isPinLocked}>
                                {children}
                            </IsPinLockedContext.Provider>
                        </QuestionsByIdContext.Provider>
                    </QuestionIdsContext.Provider>
                </QuestionDerivedContext.Provider>
            </QuestionActionsContext.Provider>
        </QuestionStateContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Pure helper functions (stateless, keep outside context)
// ---------------------------------------------------------------------------

function normalizeQuestions(questions: QuestionState[]): NormalizedQuestions {
    return questions.reduce<NormalizedQuestions>(
        (normalized, question) => {
            if (!hasQuestionId(normalized.byId, question.id)) {
                normalized.allIds.push(question.id);
            }
            normalized.byId[question.id] = question;
            return normalized;
        },
        { allIds: [], byId: createQuestionsById() },
    );
}

function createQuestionsById(): Record<string, QuestionState> {
    return Object.create(null) as Record<string, QuestionState>;
}

function cloneQuestionsById(
    questionsById: Record<string, QuestionState>,
): Record<string, QuestionState> {
    return Object.assign(createQuestionsById(), questionsById);
}

function hasQuestionId(
    questionsById: Record<string, QuestionState>,
    questionId: string,
): boolean {
    return Object.prototype.hasOwnProperty.call(questionsById, questionId);
}

export function getRadarDistanceDisplayValue(question: RadarQuestion): string {
    return fromMeters(question.distanceMeters, question.distanceUnit);
}

export function getRadarDistanceDisplayValueForUnit(
    question: RadarQuestion,
    unit: DistanceUnit,
): string {
    return fromMeters(question.distanceMeters, unit);
}

export function updateQuestionCenter(
    question: QuestionState,
    center: Position,
): QuestionState {
    if (question.type !== "radar" && question.type !== "matching") {
        return question;
    }
    return {
        ...question,
        center,
        updatedAt: new Date().toISOString(),
    };
}

export const updateRadarQuestionCenter = updateQuestionCenter;

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
    unit: DistanceUnit,
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
    category?: MatchingCategory,
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
        case "matching":
            return {
                answer: "unanswered",
                candidates: [],
                category: category ?? "transit-line",
                center,
                createdAt: now,
                id: createQuestionId(),
                lineId: null,
                lineName: null,
                selectedOsmId: null,
                selectedOsmType: null,
                targetName: null,
                targetOsmId: null,
                targetOsmType: null,
                type: "matching",
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
    if (isMatchingQuestion(question)) {
        return normalizeTransitLineQuestion(question);
    }
    return question as QuestionState;
}

function isLegacyRadiusQuestion(value: unknown): value is {
    center: Position;
    createdAt: string;
    id: string;
    radiusMeters: number;
    radiusOption: RadarDistanceOption;
    radiusUnit: DistanceUnit;
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

function isMatchingQuestion(
    value: unknown,
): value is Extract<QuestionState, { type: "matching" }> {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "matching"
    );
}
