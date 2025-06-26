import { useStore } from "@nanostores/react";

import { showTutorial, tutorialStep } from "@/lib/context";

export function useTutorialStep<T>(
    defaultValue: T,
    steps: number[],
    trueReplacement: T = true as T,
    falseReplacement: T = false as T,
): T {
    const $showTutorial = useStore(showTutorial);
    const $tutorialStep = useStore(tutorialStep);

    if ($showTutorial) {
        return steps.includes($tutorialStep)
            ? trueReplacement
            : falseReplacement;
    }
    return defaultValue;
}
