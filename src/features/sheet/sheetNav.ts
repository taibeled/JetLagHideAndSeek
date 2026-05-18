import type { SheetRouteName } from "@/features/sheet/sheetRoutes";

const routeDepth: Record<SheetRouteName, number> = {
    main: 0,
    questions: 1,
    "add-question": 1,
    "question-detail": 2,
    settings: 1,
    "play-area": 2,
    "hiding-zone": 2,
};

export function getNavDirection(
    from: SheetRouteName,
    to: SheetRouteName,
): "forward" | "back" {
    return routeDepth[to] > routeDepth[from] ? "forward" : "back";
}

export function getBackTarget(route: SheetRouteName): SheetRouteName | null {
    switch (route) {
        case "main":
            return null;
        case "questions":
        case "add-question":
        case "settings":
            return "main";
        case "question-detail":
            return "questions";
        case "play-area":
        case "hiding-zone":
            return "settings";
    }
}
