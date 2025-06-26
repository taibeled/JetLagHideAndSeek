import { useStore } from "@nanostores/react";

import { showTutorial, tutorialStep } from "@/lib/context";

export function useTutorialStep(
    defaultValue: boolean,
    steps: number[],
): boolean {
    const $showTutorial = useStore(showTutorial);
    const $tutorialStep = useStore(tutorialStep);

    if ($showTutorial) {
        return steps.includes($tutorialStep) ? true : false;
    }
    return defaultValue;
}
