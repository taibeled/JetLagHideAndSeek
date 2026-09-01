import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { QuestionSidebar } from "@/components/QuestionSidebar.tsx";
import { defaultUnit, hiderMode, isLoading, questions } from "@/lib/context";
import type { ThermometerQuestion, Units } from "@/maps/schema";

import {
    clickButtonByName,
    clickLockButton,
    expectButtonsWithTitleToBeDisabled,
    expectButtonsWithTitleToBeEnabled,
    expectRadioButtonWithNameToBeDisabled,
    expectRadioButtonWithNameToHave,
    getQuestionData,
    setupTestContext,
} from "./testUtils.ts";

const createMockThermometerData = (
    overrides: Partial<ThermometerQuestion> = {},
): ThermometerQuestion => ({
    latA: 52.37,
    lngA: 4.89,
    latB: 52.38,
    lngB: 4.9,
    warmer: true,
    colorA: "red",
    colorB: "blue",
    drag: true,
    collapsed: false,
    ...overrides,
});

describe("ThermometerQuestionComponent", () => {
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
            await clickButtonByName(user, "Add Thermometer");

            await waitFor(() => {
                expect(questions.get()).toHaveLength(1);
            });

            expect(questions.get()).toHaveLength(1);

            expect(questions.get()[0].id).toBe("thermometer");

            const actualQuestionData: ThermometerQuestion = questions.get()[0]
                .data as ThermometerQuestion;
            expect(actualQuestionData).toMatchObject({
                warmer: true,
                drag: true,
                collapsed: false,
            });
            expect(actualQuestionData.latA).toBeCloseTo(52.4, 1);
            expect(actualQuestionData.lngA).toBeCloseTo(5, 1);
            expect(actualQuestionData.latB).toBeCloseTo(52.4, 1);
            expect(actualQuestionData.lngB).toBeCloseTo(4.9, 1);

            const questionCard = await screen.findByText("Thermometer 1");
            expect(questionCard).toBeInTheDocument();
            expect(screen.getByText("Start")).toBeInTheDocument();
            expect(screen.getByText("End")).toBeInTheDocument();
            expect(screen.getByText(/Distance:/)).toBeInTheDocument();

            expectRadioButtonWithNameToHave("Colder", "off");
            expectRadioButtonWithNameToHave("Warmer", "on");
        });
    });

    describe("rendering", () => {
        it("renders with correct label based on question index", async () => {
            act(() => {
                questions.set([
                    {
                        id: "thermometer",
                        key: 1,
                        data: createMockThermometerData(),
                    },
                    {
                        id: "thermometer",
                        key: 2,
                        data: createMockThermometerData(),
                    },
                ]);
            });

            render(<QuestionSidebar />);

            expect(screen.getByText(/Thermometer\s+1/)).toBeInTheDocument();
            expect(screen.getByText(/Thermometer\s+2/)).toBeInTheDocument();
        });
    });

    describe("warmer / colder toggles", () => {
        it("switches between warmer/colder states", async () => {
            const user = userEvent.setup();
            const data = createMockThermometerData({ warmer: true });

            act(() => {
                questions.set([{ id: "thermometer", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            const colderButton = screen.getByRole("radio", { name: "Colder" });
            await user.click(colderButton);

            expect(data.warmer).toBe(false);
            expectRadioButtonWithNameToHave("Colder", "on");
            expectRadioButtonWithNameToHave("Warmer", "off");

            const warmerButton = screen.getByRole("radio", { name: "Warmer" });
            await user.click(warmerButton);

            expect(data.warmer).toBe(true);
            expectRadioButtonWithNameToHave("Colder", "off");
            expectRadioButtonWithNameToHave("Warmer", "on");
        });
    });

    describe("disabled states", () => {
        it("toggle is disabled when hiderMode is active", () => {
            const data = createMockThermometerData();

            act(() => {
                questions.set([{ id: "thermometer", key: 1, data }]);
                hiderMode.set({ latitude: 52.37, longitude: 4.89 });
            });

            render(<QuestionSidebar />);
            expectRadioButtonWithNameToBeDisabled("Colder");
            expectRadioButtonWithNameToBeDisabled("Warmer");
        });

        it("all inputs are disabled when isLoading is true", () => {
            const data = createMockThermometerData();

            act(() => {
                questions.set([{ id: "thermometer", key: 1, data }]);
                isLoading.set(true);
            });

            render(<QuestionSidebar />);

            expectButtonsWithTitleToBeDisabled("Edit coordinates", 2);
            expectButtonsWithTitleToBeDisabled("Set to current location", 2);
            expectButtonsWithTitleToBeDisabled(
                "Paste coordinates from clipboard",
                2,
            );

            expectRadioButtonWithNameToBeDisabled("Colder");
            expectRadioButtonWithNameToBeDisabled("Warmer");

            expectButtonsWithTitleToBeEnabled(
                "Copy coordinates to clipboard",
                2,
            );

            const lockBtn = screen.getByTestId("lock-button");
            expect(lockBtn).toBeDisabled();
        });

        describe("lock button", () => {
            it("toggles locked (drag) state", async () => {
                const user = userEvent.setup();
                const data = createMockThermometerData({ drag: true });
                act(() => {
                    questions.set([{ id: "thermometer", key: 1, data }]);
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
                const data = createMockThermometerData({ drag: false });

                act(() => {
                    questions.set([{ id: "thermometer", key: 1, data }]);
                });

                render(<QuestionSidebar />);

                expectButtonsWithTitleToBeDisabled("Edit coordinates", 2);
                expectButtonsWithTitleToBeDisabled(
                    "Set to current location",
                    2,
                );
                expectButtonsWithTitleToBeDisabled(
                    "Paste coordinates from clipboard",
                    2,
                );

                expectRadioButtonWithNameToBeDisabled("Colder");
                expectRadioButtonWithNameToBeDisabled("Warmer");

                expectButtonsWithTitleToBeEnabled(
                    "Copy coordinates to clipboard",
                    2,
                );

                expect(screen.getByTestId("lock-button")).toBeEnabled();
            });
        });
    });

    describe("unit labels", () => {
        const cases: [string, Units, RegExp][] = [
            ["shows Miles when defaultUnit is miles", "miles", /Miles/],
            ["shows KM when defaultUnit is kilometers", "kilometers", /KM/],
            ["shows Meters when defaultUnit is meters", "meters", /Meters/],
        ];

        it.each(cases)("%s", async (_, selectedUnit, expected) => {
            const data = createMockThermometerData({
                latA: 52,
                lngA: 4,
                latB: 52,
                lngB: 5,
            });

            act(() => {
                defaultUnit.set(selectedUnit);
                questions.set([{ id: "thermometer", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            expect(screen.getByText(expected)).toBeInTheDocument();
        });
    });

    describe("distance calculations", () => {
        const extractDistanceValue = (text: string): number => {
            const match = text.match(/Distance:\s*([\d.]+)/);
            return match ? parseFloat(match[1]) : NaN;
        };

        const cases: [string, Partial<ThermometerQuestion>, number][] = [
            [
                "calculates Amsterdam to Rotterdam as approximately 57km",
                {
                    latA: 52.37,
                    lngA: 4.89,
                    latB: 51.92,
                    lngB: 4.48,
                },
                57.328,
            ],
            [
                "calculates 0.000 distance for same point",
                {
                    latA: 52,
                    lngA: 4,
                    latB: 52,
                    lngB: 4,
                },
                0,
            ],
            [
                "calculates correctly at equator (lat=0)",
                {
                    latA: 0,
                    lngA: 0,
                    latB: 0,
                    lngB: 1,
                },
                111.195,
            ],
            [
                "calculates correctly at prime meridian (lng=0)",
                {
                    latA: 0,
                    lngA: 0,
                    latB: 1,
                    lngB: 0,
                },
                111.195,
            ],
        ];

        it.each(cases)("%s", async (_, coordinates, expectedKm) => {
            const data = createMockThermometerData(coordinates);

            act(() => {
                defaultUnit.set("kilometers");
                questions.set([{ id: "thermometer", key: 1, data }]);
            });

            render(<QuestionSidebar />);

            const distanceText =
                screen.getByText(/Distance:/).textContent ?? "";
            expect(distanceText).toMatch(/Distance:\s*([\d]+\.[\d]{3})/);
            const distanceValue = extractDistanceValue(distanceText);
            expect(distanceValue).toBe(expectedKm);
        });
    });
});
