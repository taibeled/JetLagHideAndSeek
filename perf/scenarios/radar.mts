import { buildRadarQuestionRenderState } from "../../src/features/questions/radar/radarGeometry.ts";
import type { RadarQuestion } from "../../src/features/questions/radar/radarTypes.ts";
import type { PerfScenario } from "../lib.mts";

const questionsByCount = new Map(
    [1, 10, 50].map((count) => [count, buildQuestions(count)]),
);

export const radarScenarios: PerfScenario[] = [
    ...[1, 10, 50].map((count) =>
        radarScenario(
            `radar/${count}-questions-cold`,
            questionsByCount.get(count) ?? [],
        ),
    ),
    radarScenario(
        "radar/50-questions-one-answer-edit",
        editQuestion(questionsByCount.get(50) ?? [], 24, {
            answer: "negative",
        }),
    ),
    radarScenario(
        "radar/50-questions-one-distance-edit",
        editQuestion(questionsByCount.get(50) ?? [], 24, {
            distanceMeters: 15_000,
        }),
    ),
    {
        group: "radar",
        iterations: 10,
        name: "radar/50-questions-repeat-current",
        run: () => {
            const questions = questionsByCount.get(50) ?? [];
            buildRadarQuestionRenderState(questions);
            return {
                metrics: { questions: questions.length },
                output: buildRadarQuestionRenderState(questions),
            };
        },
        warmups: 3,
    },
];

function radarScenario(name: string, questions: RadarQuestion[]): PerfScenario {
    return {
        group: "radar",
        iterations: questions.length > 10 ? 8 : 20,
        name,
        run: () => ({
            metrics: { questions: questions.length },
            output: buildRadarQuestionRenderState(questions),
        }),
        warmups: 3,
    };
}

function buildQuestions(count: number): RadarQuestion[] {
    return Array.from({ length: count }, (_, index) => ({
        answer:
            index % 3 === 0
                ? ("positive" as const)
                : index % 3 === 1
                  ? ("negative" as const)
                  : ("unanswered" as const),
        center: [
            139.65 + (index % 10) * 0.02,
            35.6 + Math.floor(index / 10) * 0.02,
        ],
        createdAt: "2026-06-01T00:00:00.000Z",
        distanceMeters: 5000 + (index % 5) * 1000,
        distanceOption: "other" as const,
        distanceUnit: "km" as const,
        id: `radar-${index}`,
        type: "radar" as const,
        updatedAt: "2026-06-01T00:00:00.000Z",
    }));
}

function editQuestion(
    questions: RadarQuestion[],
    index: number,
    update: Partial<RadarQuestion>,
): RadarQuestion[] {
    return questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...update } : question,
    );
}
