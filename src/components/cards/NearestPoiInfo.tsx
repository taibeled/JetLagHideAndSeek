import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import type { NearestPoiResult } from "@/lib/nearestPoi";
import { cn } from "@/lib/utils";

type NearestPoiState =
    | NearestPoiResult
    | { status: "loading"; category: string };

export const NearestPoiRow = ({
    nearestPoi,
}: {
    nearestPoi: NearestPoiState;
}) => {
    if (nearestPoi.status === "unsupported") return null;

    const label =
        nearestPoi.status === "found"
            ? nearestPoi.name
            : nearestPoi.status === "loading"
              ? `Finding closest ${nearestPoi.category}...`
              : "Unavailable";

    return (
        <SidebarMenuItem
            className={cn(
                MENU_ITEM_CLASSNAME,
                "flex-col items-start gap-1 text-sm",
            )}
        >
            <span className="font-semibold leading-tight">
                Closest {"category" in nearestPoi ? nearestPoi.category : "POI"}
                :
            </span>
            <span className="w-full min-w-0 whitespace-normal break-words leading-snug text-muted-foreground">
                {label}
            </span>
        </SidebarMenuItem>
    );
};

export const NearestPoiDistanceRow = ({
    nearestPoi,
}: {
    nearestPoi: NearestPoiState;
}) => {
    if (nearestPoi.status !== "found" || !nearestPoi.distance) return null;

    return (
        <SidebarMenuItem
            className={cn(
                MENU_ITEM_CLASSNAME,
                "flex-col items-start gap-1 text-sm",
            )}
        >
            <span className="font-semibold leading-tight">Distance:</span>
            <span className="w-full min-w-0 whitespace-normal break-words leading-snug text-muted-foreground">
                {nearestPoi.distance.text}
            </span>
        </SidebarMenuItem>
    );
};
