import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { defaultPlayArea } from "@/features/map/playArea";
import { OsmMatchingQuestionDetailScreen } from "@/features/questions/matching/OsmMatchingQuestionDetailScreen";
import type { MatchingQuestion } from "@/features/questions/matching/matchingTypes";
import type { QuestionState } from "@/features/questions/questionTypes";

const mockCandidates = [
    {
        distanceMeters: 150,
        lat: 35.681,
        lon: 139.761,
        name: "Nearest Park",
        osmId: 1,
        osmType: "node" as const,
        tags: {},
    },
    {
        distanceMeters: 900,
        lat: 35.685,
        lon: 139.765,
        name: "Farther Park",
        osmId: 2,
        osmType: "way" as const,
        tags: {},
    },
    {
        distanceMeters: 2100,
        lat: 35.69,
        lon: 139.77,
        name: "Distant Park",
        osmId: 3,
        osmType: "relation" as const,
        tags: {},
    },
];

let mockFindMatchingFeaturesWithCache: jest.Mock;

jest.mock("@/features/questions/matching/osmMatchingCache", () => ({
    findMatchingFeaturesWithCache: (...args: unknown[]) =>
        mockFindMatchingFeaturesWithCache(...args),
}));

function TestScreen({
    initialQuestion,
    onUpdate,
}: {
    initialQuestion: MatchingQuestion;
    onUpdate: jest.Mock;
}) {
    const [question, setQuestion] =
        React.useState<MatchingQuestion>(initialQuestion);

    // Sync state when the parent rerenders with a new initialQuestion
    React.useEffect(() => {
        setQuestion(initialQuestion);
    }, [initialQuestion]);

    const wrappedUpdate = jest.fn(
        (questionId: string, updater: (q: QuestionState) => QuestionState) => {
            const updated = updater(question) as MatchingQuestion;
            setQuestion(updated);
            onUpdate(questionId, updater);
            return updated;
        },
    );

    return (
        <OsmMatchingQuestionDetailScreen
            question={question}
            updateQuestion={wrappedUpdate}
        />
    );
}

describe("OsmMatchingQuestionDetailScreen", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindMatchingFeaturesWithCache = jest.fn().mockResolvedValue({
            candidates: mockCandidates,
            source: "network",
        });
    });

    it("renders candidate list sorted by distance", async () => {
        const question: MatchingQuestion = {
            answer: "unanswered",
            candidates: mockCandidates,
            category: "park",
            center: defaultPlayArea.center,
            createdAt: "2026-05-30T00:00:00.000Z",
            id: "matching-1",
            lineId: null,
            lineName: null,
            selectedOsmId: null,
            selectedOsmType: null,
            targetName: null,
            targetOsmId: null,
            targetOsmType: null,
            type: "matching",
            updatedAt: "2026-05-30T00:00:00.000Z",
        };
        const onUpdate = jest.fn();

        const screen = render(
            <TestScreen initialQuestion={question} onUpdate={onUpdate} />,
        );

        await waitFor(() => {
            expect(screen.getByText("Nearest Park")).toBeTruthy();
            expect(screen.getByText("Farther Park")).toBeTruthy();
            expect(screen.getByText("Distant Park")).toBeTruthy();
        });
    });

    it("shows right-justified distance text for each candidate", async () => {
        const question: MatchingQuestion = {
            answer: "unanswered",
            candidates: mockCandidates,
            category: "park",
            center: defaultPlayArea.center,
            createdAt: "2026-05-30T00:00:00.000Z",
            id: "matching-1",
            lineId: null,
            lineName: null,
            selectedOsmId: null,
            selectedOsmType: null,
            targetName: null,
            targetOsmId: null,
            targetOsmType: null,
            type: "matching",
            updatedAt: "2026-05-30T00:00:00.000Z",
        };
        const onUpdate = jest.fn();

        const screen = render(
            <TestScreen initialQuestion={question} onUpdate={onUpdate} />,
        );

        await waitFor(() => {
            expect(screen.getByText("150 meters")).toBeTruthy();
            expect(screen.getByText("900 meters")).toBeTruthy();
            expect(screen.getByText("2.1 km")).toBeTruthy();
        });
    });

    it("highlights the selected candidate", async () => {
        const question: MatchingQuestion = {
            answer: "unanswered",
            candidates: mockCandidates,
            category: "park",
            center: defaultPlayArea.center,
            createdAt: "2026-05-30T00:00:00.000Z",
            id: "matching-1",
            lineId: null,
            lineName: null,
            selectedOsmId: 2,
            selectedOsmType: "way",
            targetName: "Farther Park",
            targetOsmId: 2,
            targetOsmType: "way",
            type: "matching",
            updatedAt: "2026-05-30T00:00:00.000Z",
        };
        const onUpdate = jest.fn();

        const screen = render(
            <TestScreen initialQuestion={question} onUpdate={onUpdate} />,
        );

        await waitFor(() => {
            const selectedRow = screen.getByTestId("osm-matching-candidate-2");
            expect(selectedRow).toBeTruthy();
        });
    });

    it("tapping candidate selects it and syncs targetOsmId", async () => {
        const question: MatchingQuestion = {
            answer: "unanswered",
            candidates: mockCandidates,
            category: "park",
            center: defaultPlayArea.center,
            createdAt: "2026-05-30T00:00:00.000Z",
            id: "matching-1",
            lineId: null,
            lineName: null,
            selectedOsmId: null,
            selectedOsmType: null,
            targetName: null,
            targetOsmId: null,
            targetOsmType: null,
            type: "matching",
            updatedAt: "2026-05-30T00:00:00.000Z",
        };
        const onUpdate = jest.fn((questionId, updater) => {
            return updater(question);
        });

        const screen = render(
            <TestScreen initialQuestion={question} onUpdate={onUpdate} />,
        );

        await waitFor(() => {
            expect(screen.getByText("Farther Park")).toBeTruthy();
        });

        fireEvent.press(screen.getByTestId("osm-matching-candidate-2"));

        await waitFor(() => {
            expect(onUpdate).toHaveBeenCalledWith(
                "matching-1",
                expect.any(Function),
            );
        });

        const lastCall =
            onUpdate.mock.results[onUpdate.mock.results.length - 1];
        const updated = lastCall.value as MatchingQuestion;
        expect(updated.selectedOsmId).toBe(2);
        expect(updated.selectedOsmType).toBe("way");
        expect(updated.targetOsmId).toBe(2);
        expect(updated.targetOsmType).toBe("way");
        expect(updated.targetName).toBe("Farther Park");
    });

    it("auto-selects nearest on load when candidates are empty", async () => {
        const question: MatchingQuestion = {
            answer: "unanswered",
            candidates: [],
            category: "park",
            center: defaultPlayArea.center,
            createdAt: "2026-05-30T00:00:00.000Z",
            id: "matching-1",
            lineId: null,
            lineName: null,
            selectedOsmId: null,
            selectedOsmType: null,
            targetName: null,
            targetOsmId: null,
            targetOsmType: null,
            type: "matching",
            updatedAt: "2026-05-30T00:00:00.000Z",
        };
        const onUpdate = jest.fn((questionId, updater) => {
            return updater(question);
        });

        render(<TestScreen initialQuestion={question} onUpdate={onUpdate} />);

        await waitFor(() => {
            expect(mockFindMatchingFeaturesWithCache).toHaveBeenCalled();
        });

        const lastCall =
            onUpdate.mock.results[onUpdate.mock.results.length - 1];
        const updated = lastCall.value as MatchingQuestion;
        expect(updated.candidates).toEqual(mockCandidates);
        expect(updated.selectedOsmId).toBe(1);
        expect(updated.selectedOsmType).toBe("node");
        expect(updated.targetOsmId).toBe(1);
        expect(updated.targetName).toBe("Nearest Park");
    });

    it("refresh button re-queries with forceRefresh and updates candidates", async () => {
        const question: MatchingQuestion = {
            answer: "unanswered",
            candidates: mockCandidates,
            category: "park",
            center: defaultPlayArea.center,
            createdAt: "2026-05-30T00:00:00.000Z",
            id: "matching-1",
            lineId: null,
            lineName: null,
            selectedOsmId: 1,
            selectedOsmType: "node",
            targetName: "Nearest Park",
            targetOsmId: 1,
            targetOsmType: "node",
            type: "matching",
            updatedAt: "2026-05-30T00:00:00.000Z",
        };
        const onUpdate = jest.fn();

        const screen = render(
            <TestScreen initialQuestion={question} onUpdate={onUpdate} />,
        );

        await waitFor(() => {
            expect(screen.getByTestId("osm-matching-refresh")).toBeTruthy();
        });

        mockFindMatchingFeaturesWithCache.mockClear();
        const newCandidates = [
            {
                distanceMeters: 300,
                lat: 35.69,
                lon: 139.77,
                name: "Refreshed Park",
                osmId: 99,
                osmType: "node" as const,
                tags: {},
            },
        ];
        mockFindMatchingFeaturesWithCache.mockResolvedValue({
            candidates: newCandidates,
            source: "network",
        });

        fireEvent.press(screen.getByTestId("osm-matching-refresh"));

        await waitFor(() => {
            expect(mockFindMatchingFeaturesWithCache).toHaveBeenCalledWith(
                "park",
                defaultPlayArea.center,
                expect.objectContaining({ forceRefresh: true }),
            );
        });
    });

    it("renders stale-cache banner when cache source is stale", async () => {
        mockFindMatchingFeaturesWithCache.mockResolvedValue({
            candidates: mockCandidates,
            source: "stale",
        });

        const question: MatchingQuestion = {
            answer: "unanswered",
            candidates: [],
            category: "park",
            center: defaultPlayArea.center,
            createdAt: "2026-05-30T00:00:00.000Z",
            id: "matching-1",
            lineId: null,
            lineName: null,
            selectedOsmId: null,
            selectedOsmType: null,
            targetName: null,
            targetOsmId: null,
            targetOsmType: null,
            type: "matching",
            updatedAt: "2026-05-30T00:00:00.000Z",
        };
        const onUpdate = jest.fn();

        const screen = render(
            <TestScreen initialQuestion={question} onUpdate={onUpdate} />,
        );

        await waitFor(() => {
            expect(
                screen.getByTestId("osm-matching-stale"),
            ).toBeTruthy();
        });
    });

    it("clears stale candidates and target when center changes", async () => {
        const question: MatchingQuestion = {
            answer: "unanswered",
            candidates: mockCandidates,
            category: "park",
            center: defaultPlayArea.center,
            createdAt: "2026-05-30T00:00:00.000Z",
            id: "matching-1",
            lineId: null,
            lineName: null,
            selectedOsmId: 1,
            selectedOsmType: "node",
            targetName: "Nearest Park",
            targetOsmId: 1,
            targetOsmType: "node",
            type: "matching",
            updatedAt: "2026-05-30T00:00:00.000Z",
        };
        const onUpdate = jest.fn((questionId, updater) => {
            return updater(question);
        });

        const screen = render(
            <TestScreen initialQuestion={question} onUpdate={onUpdate} />,
        );

        await waitFor(() => {
            expect(screen.getByText("Nearest Park")).toBeTruthy();
        });

        mockFindMatchingFeaturesWithCache.mockClear();

        const movedQuestion: MatchingQuestion = {
            ...question,
            center: [139.8, 35.8],
        };

        screen.rerender(
            <TestScreen initialQuestion={movedQuestion} onUpdate={onUpdate} />,
        );

        await waitFor(() => {
            expect(mockFindMatchingFeaturesWithCache).toHaveBeenCalledWith(
                "park",
                [139.8, 35.8],
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            );
        });
    });
});
