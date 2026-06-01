import {
    parseOverpassElements,
    rankMatchingFeatures,
} from "../../src/features/questions/matching/osmMatching.ts";
import type { MatchingQuestion } from "../../src/features/questions/matching/matchingTypes.ts";
import type { RadarQuestion } from "../../src/features/questions/radar/radarTypes.ts";
import {
    loadCapture,
    perfPath,
    sha256,
    type CaptureEnvelope,
    type PerfScenario,
} from "../lib.mts";

type OverpassPayload = {
    elements?: Parameters<typeof parseOverpassElements>[0];
};

const hospitalCapture = loadCapture<OverpassPayload>(
    perfPath("fixtures/overpass/matching/tokyo-hospitals-5km.json"),
);
const candidates = rankMatchingFeatures(
    parseOverpassElements(hospitalCapture.payload.elements ?? [], "hospital"),
    [139.767125, 35.681236],
    10,
);

export const persistenceScenarios: PerfScenario[] = [
    ...[10, 50, 100].flatMap((count) => {
        const questions = buildQuestions(count);
        return [
            serializeScenario(
                `persistence/${count}-questions-whole-slice`,
                questions,
                () => JSON.stringify(questions),
            ),
            serializeScenario(
                `persistence/${count}-questions-one-record-prototype`,
                questions,
                () => JSON.stringify(questions[Math.floor(count / 2)]),
            ),
        ];
    }),
];

function serializeScenario(
    name: string,
    questions: (MatchingQuestion | RadarQuestion)[],
    serialize: () => string,
): PerfScenario {
    return {
        fixtureHash: (hospitalCapture as CaptureEnvelope).responseSha256,
        group: "persistence",
        iterations: 50,
        name,
        run: () => {
            const json = serialize();
            return {
                metrics: {
                    questions: questions.length,
                    serializedBytes: Buffer.byteLength(json),
                },
                output: sha256(json),
            };
        },
        warmups: 10,
    };
}

function buildQuestions(count: number): (MatchingQuestion | RadarQuestion)[] {
    return Array.from({ length: count }, (_, index) =>
        index % 2 === 0 ? matchingQuestion(index) : radarQuestion(index),
    );
}

function matchingQuestion(index: number): MatchingQuestion {
    return {
        answer: index % 3 === 0 ? "positive" : "unanswered",
        candidates,
        category: "hospital",
        center: [139.767125, 35.681236],
        createdAt: "2026-06-01T00:00:00.000Z",
        id: `matching-${index}`,
        lineId: null,
        lineName: null,
        selectedOsmId: candidates[0]?.osmId ?? null,
        selectedOsmType: candidates[0]?.osmType ?? null,
        targetName: candidates[0]?.name ?? null,
        targetOsmId: candidates[0]?.osmId ?? null,
        targetOsmType: candidates[0]?.osmType ?? null,
        type: "matching",
        updatedAt: "2026-06-01T00:00:00.000Z",
    };
}

function radarQuestion(index: number): RadarQuestion {
    return {
        answer: "unanswered",
        center: [139.7, 35.65],
        createdAt: "2026-06-01T00:00:00.000Z",
        distanceMeters: 5000,
        distanceOption: "5km",
        distanceUnit: "km",
        id: `radar-${index}`,
        type: "radar",
        updatedAt: "2026-06-01T00:00:00.000Z",
    };
}
