import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Map } from "leaflet";
import { expect } from "vitest";

import {
    defaultUnit,
    hiderMode,
    isLoading,
    leafletMapContext,
    questions,
} from "@/lib/context";

export function getQuestionData(index: number = 0) {
    return questions.get()[index].data;
}

// --------- UI Event Utilities ---------

export async function clickButtonByName(
    user: ReturnType<typeof userEvent.setup>,
    name: string | RegExp,
) {
    const button = await screen.findByRole("button", { name });
    await user.click(button);
}

export async function clickTrashButton(
    user: ReturnType<typeof userEvent.setup>,
    index = 0,
) {
    const buttons = await screen.findAllByTestId("trash-button");
    await user.click(buttons[index]);
}

export async function clickLockButton(
    user: ReturnType<typeof userEvent.setup>,
    index = 0,
) {
    const buttons = await screen.findAllByTestId("lock-button");
    await user.click(buttons[index]);
}

export function expectButtonsWithTitleToBeDisabled(
    title: string,
    numberOfButtons: number = 1,
) {
    const buttons = screen.getAllByTitle(title);
    expect(buttons).toHaveLength(numberOfButtons);
    buttons.forEach((btn) => expect(btn).toBeDisabled());
}

export function expectButtonsWithTitleToBeEnabled(
    title: string,
    numberOfButtons: number = 1,
) {
    const buttons = screen.getAllByTitle(title);
    expect(buttons).toHaveLength(numberOfButtons);
    buttons.forEach((btn) => expect(btn).toBeEnabled());
}

export function expectRadioButtonWithNameToBeDisabled(name: string) {
    const button = screen.getByRole("radio", { name: name });
    expect(button).toBeDisabled();
}

export function expectRadioButtonWithNameToHave(
    name: string,
    dataState: string,
) {
    const button = screen.getByRole("radio", { name: name });
    expect(button).toHaveAttribute("data-state", dataState);
}

// --------- Test Context ---------

export const mockMap = {
    getCenter: () => ({ lat: 52.37, lng: 4.89 }),
    invalidateSize: () => {},
} as unknown as Map;

export function setupTestContext() {
    act(() => {
        questions.set([]);
        hiderMode.set(false);
        isLoading.set(false);
        leafletMapContext.set(mockMap);
        defaultUnit.set("miles");
    });
}
