import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { QuestionSidebar } from "@/components/QuestionSidebar.tsx";
import { hiderMode, isLoading, questions } from "@/lib/context";
import type { RadiusQuestion } from "@/maps/schema";

import {
    clickButtonByName,
    clickLockButton,
    expectButtonsWithTitleToBeDisabled,
    expectRadioButtonWithNameToBeDisabled,
    expectRadioButtonWithNameToHave,
    getQuestionData,
    setupTestContext,
} from "./testUtils.ts";

const someRadiusData = (
    overrides: Partial<RadiusQuestion> = {},
): RadiusQuestion => ({
    lat: 52.37,
    lng: 4.89,
    radius: 50,
    unit: "miles",
    within: true,
    drag: true,
    color: "red",
    collapsed: false,
    ...overrides,
});

describe("RadiusQuestionComponent", () => {
    beforeEach(setupTestContext);

    describe("Add question", () => {
        it("should add question via UI", async () => {
            const user = userEvent.setup();

            act(() => {
                questions.set([]);
            });

            expect(questions.get()).toHaveLength(0);

            render(<QuestionSidebar />);

            await clickButtonByName(user, "Add Question");
            await clickButtonByName(user, "Add Radius");

            await waitFor(() => {
                expect(questions.get()).toHaveLength(1);
            });

            expect(questions.get()).toHaveLength(1);

            const expectedQuestion = {
                id: "radius",
                data: {
                    lat: 52.37,
                    lng: 4.89,
                    radius: 50,
                    unit: "miles",
                    within: true,
                    drag: true,
                    collapsed: false,
                },
            };

            expect(questions.get()[0]).toMatchObject(expectedQuestion);

            const questionCard = await screen.findByText("Radius 1");
            expect(questionCard).toBeInTheDocument();
            const radiusInput = screen.getByRole("spinbutton");
            expect(radiusInput).toHaveValue(expectedQuestion.data.radius);

            expectRadioButtonWithNameToHave("Inside", "on");
            expectRadioButtonWithNameToHave("Outside", "off");

            const unitInput = screen.getAllByRole("combobox")[0];
            expect(unitInput).toHaveTextContent("Miles");
        });
    });

    describe("rendering", () => {
        it("renders with correct label based on question index", async () => {
            act(() => {
                questions.set([
                    { id: "radius", key: 1, data: someRadiusData() },
                    { id: "radius", key: 2, data: someRadiusData() },
                ]);
            });

            render(<QuestionSidebar />);
            expect(screen.getByText("Radius 1")).toBeInTheDocument();
            expect(screen.getByText("Radius 2")).toBeInTheDocument();
        });

        it("displays radius input with correct initial value", () => {
            const data = someRadiusData({ radius: 75 });

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            const radiusInput = screen.getByRole("spinbutton");
            expect(radiusInput).toHaveValue(75);
        });

        it("displays toggle group with correct initial inside/outside state", () => {
            const data = someRadiusData({ within: true });

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            expectRadioButtonWithNameToHave("Inside", "on");
            expectRadioButtonWithNameToHave("Outside", "off");
        });

        it("displays toggle group with outside state when within is false", () => {
            const data = someRadiusData({ within: false });

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            expectRadioButtonWithNameToHave("Inside", "off");
            expectRadioButtonWithNameToHave("Outside", "on");
        });

        it("edit coordinates button are rendered", () => {
            const data = someRadiusData();

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            expect(screen.getByTitle("Edit coordinates")).toBeInTheDocument();
            expect(
                screen.getByTitle("Set to current location"),
            ).toBeInTheDocument();
            expect(
                screen.getByTitle("Paste coordinates from clipboard"),
            ).toBeInTheDocument();
            expect(
                screen.getByTitle("Copy coordinates to clipboard"),
            ).toBeInTheDocument();
        });

        it("unit select is rendered and reflects current unit value", () => {
            const data = someRadiusData({ unit: "kilometers" });

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            const unitInput = screen.getAllByRole("combobox")[0];
            expect(unitInput).toHaveTextContent("Kilometers");
        });
    });

    describe("inside / outside toggles", () => {
        it("switches between inside/outside states", async () => {
            const user = userEvent.setup();
            const data = someRadiusData({ within: true });

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            const outsideButton = screen.getByRole("radio", {
                name: "Outside",
            });
            await user.click(outsideButton);

            expect(data.within).toBe(false);
            expectRadioButtonWithNameToHave("Inside", "off");
            expectRadioButtonWithNameToHave("Outside", "on");

            const insideButton = screen.getByRole("radio", { name: "Inside" });
            await user.click(insideButton);

            expect(data.within).toBe(true);
            expectRadioButtonWithNameToHave("Inside", "on");
            expectRadioButtonWithNameToHave("Outside", "off");
        });
    });

    describe("radius input", () => {
        it.each([
            ["handles regular number", "100", 100],
            ["handles negative number input", "-25", -25],
            ["accepts zero value correctly", "0", 0],
            ["handles very large numbers", "999999999", 999999999],
            ["handles decimal values correctly", "50.5", 50.5],
        ])("%s", async (_, input, expected) => {
            const user = userEvent.setup();
            const data = someRadiusData({ radius: 50 });

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            const radiusInput = screen.getByRole("spinbutton");
            await user.clear(radiusInput);
            if (input !== null) {
                await user.type(radiusInput, input);
            }

            await waitFor(() => {
                expect(data.radius).toBe(expected);
            });
        });

        it("handles clearing (empty input stores NaN) and re-entering a value", async () => {
            const user = userEvent.setup();
            const data = someRadiusData({ radius: 50 });

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            const radiusInput = screen.getByRole("spinbutton");

            await user.clear(radiusInput);
            await waitFor(() => {
                expect(data.radius).toBeNaN();
            });

            await user.type(radiusInput, "75");
            await waitFor(() => {
                expect(data.radius).toBe(75);
            });
        });
    });

    describe("disabled states", () => {
        it("toggle is disabled when hiderMode is active", () => {
            const data = someRadiusData();

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
                hiderMode.set({ latitude: 52.37, longitude: 4.89 });
            });

            render(<QuestionSidebar />);

            expectRadioButtonWithNameToBeDisabled("Inside");
            expectRadioButtonWithNameToBeDisabled("Outside");
        });

        it("all inputs are disabled when isLoading is true", () => {
            const data = someRadiusData();

            act(() => {
                questions.set([{ id: "radius", key: 1, data }]);
                isLoading.set(true);
            });

            render(<QuestionSidebar />);

            const radiusInput = screen.getByRole("spinbutton");
            expect(radiusInput).toBeDisabled();

            const unitInput = screen.getAllByRole("combobox")[0];
            expect(unitInput).toBeDisabled();

            expectRadioButtonWithNameToBeDisabled("Inside");
            expectRadioButtonWithNameToBeDisabled("Outside");

            expectButtonsWithTitleToBeDisabled("Edit coordinates");
            expectButtonsWithTitleToBeDisabled("Set to current location");
            expectButtonsWithTitleToBeDisabled(
                "Paste coordinates from clipboard",
            );

            expect(screen.getByTestId("lock-button")).toBeDisabled();
        });

        describe("lock button", () => {

            it("toggles locked (drag) state and icon", async () => {
                const user = userEvent.setup();
                const data = someRadiusData({ drag: true });
                act(() => {
                    questions.set([{ id: "radius", key: 1, data }]);
                });

                render(<QuestionSidebar />);

                expect(getQuestionData().drag).toBe(true);
                await clickLockButton(user);
                // Drag should now be false (locked)
                expect(getQuestionData().drag).toBe(false);

                // Click again to unlock
                await clickLockButton(user);
                expect(getQuestionData().drag).toBe(true);
            });

            it("all inputs are disabled when locked (drag=false)", () => {
                const data = someRadiusData({ drag: false });

                act(() => {
                    questions.set([{ id: "radius", key: 1, data }]);
                });

                render(<QuestionSidebar />);

                const radiusInput = screen.getByRole("spinbutton");
                expect(radiusInput).toBeDisabled();

                const unitInput = screen.getAllByRole("combobox")[0];
                expect(unitInput).toBeDisabled();

                expectRadioButtonWithNameToBeDisabled("Inside");
                expectRadioButtonWithNameToBeDisabled("Outside");

                expectButtonsWithTitleToBeDisabled("Edit coordinates");
                expectButtonsWithTitleToBeDisabled("Set to current location");
                expectButtonsWithTitleToBeDisabled(
                    "Paste coordinates from clipboard",
                );

                expect(screen.getByTestId("lock-button")).toBeEnabled();
            });
        });
    });
});
