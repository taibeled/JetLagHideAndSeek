import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { QuestionSidebar } from "@/components/QuestionSidebar";
import { isLoading, questions } from "@/lib/context";
import type { Question, RadiusQuestion } from "@/maps/schema";

import {
    clickButtonByName,
    clickTrashButton,
    setupTestContext,
} from "./testUtils.ts";

const someRadiusData: RadiusQuestion = {
    lat: 52.37,
    lng: 4.89,
    radius: 50,
    unit: "miles",
    within: true,
    drag: true,
    color: "red",
    collapsed: false,
};

const someQuestionWithKey = (key: number): Question => ({
    id: "radius",
    key,
    data: someRadiusData,
});

const someQuestion: Question = someQuestionWithKey(1);

describe("Trash Button", () => {
    beforeEach(setupTestContext);

    it("is disabled when isLoading is true", () => {
        act(() => {
            questions.set([someQuestion]);
            isLoading.set(true);
        });

        render(<QuestionSidebar />);

        const trashBtn = screen.getByTestId("trash-button");
        expect(trashBtn).toBeDisabled();
    });

    it("should delete question when delete button is clicked", async () => {
        const user = userEvent.setup();

        act(() => {
            questions.set([someQuestion]);
        });

        render(<QuestionSidebar />);

        //WHEN
        await clickTrashButton(user);
        await clickButtonByName(user, "Delete Question");

        //THEN
        await waitFor(() => {
            expect(questions.get()).toHaveLength(0);
        });
    });

    it("should cancel deletion when cancel button is clicked", async () => {
        const user = userEvent.setup();

        act(() => {
            questions.set([someQuestion]);
        });

        render(<QuestionSidebar />);

        //WHEN
        await clickTrashButton(user);
        await clickButtonByName(user, "Cancel");

        //THEN
        expect(questions.get()).toHaveLength(1);
    });

    it("should delete only the correct question when multiple questions exist", async () => {
        const user = userEvent.setup();

        const question1 = someQuestionWithKey(1);
        const question2 = someQuestionWithKey(2);
        const question3 = someQuestionWithKey(3);

        act(() => {
            questions.set([question1, question2, question3]);
        });

        render(<QuestionSidebar />);

        //WHEN
        await clickTrashButton(user, 1);
        await clickButtonByName(user, "Delete Question");

        //THEN
        await waitFor(() => {
            const remaining = questions.get();
            expect(remaining).toHaveLength(2);
            expect(remaining.find((q) => q.key === 1)).toBeDefined();
            expect(remaining.find((q) => q.key === 2)).toBeUndefined();
            expect(remaining.find((q) => q.key === 3)).toBeDefined();
        });
    });

    it("should delete all questions when 'Delete All Questions' button is clicked", async () => {
        const user = userEvent.setup();

        act(() => {
            questions.set([
                someQuestionWithKey(1),
                someQuestionWithKey(2),
                someQuestionWithKey(3),
            ]);
        });

        render(<QuestionSidebar />);

        //WHEN
        await clickTrashButton(user, 0);
        await clickButtonByName(user, "Delete All Questions");

        //THEN
        await waitFor(() => {
            expect(questions.get()).toHaveLength(0);
        });
    });
});
