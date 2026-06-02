/**
 * Persistent map overlay showing how many NYC subway stations remain
 * inside the current playable territory.
 *
 * Updates reactively every time a question is applied. Useful for both
 * seekers (tracking how much they've narrowed things down) and hiders
 * (knowing how many valid starting spots remain).
 *
 * Only appears once at least one question has been answered and the
 * territory has been computed.
 */

import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { useMemo } from "react";

import { NYC_MAJOR_SUBWAY_STATIONS } from "@/data/nyc-subway-major-stations";
import { playableTerritoryUnion, questions } from "@/lib/context";
import { cn } from "@/lib/utils";

const TOTAL = NYC_MAJOR_SUBWAY_STATIONS.length;

export const StationCountIndicator = () => {
    const $territory = useStore(playableTerritoryUnion);
    const $questions = useStore(questions);

    const activeCount = useMemo(() => {
        if (!$territory) return null;
        return NYC_MAJOR_SUBWAY_STATIONS.filter((s) =>
            turf.booleanPointInPolygon(turf.point([s.lng, s.lat]), $territory),
        ).length;
    }, [$territory]);

    // Nothing to show until questions have been applied and territory computed.
    if (activeCount === null || $questions.length === 0) return null;

    const pct = activeCount / TOTAL;
    const eliminated = TOTAL - activeCount;

    const countColor =
        pct > 0.5
            ? "text-emerald-400"
            : pct > 0.2
              ? "text-yellow-400"
              : "text-red-400";

    const barColor =
        pct > 0.5
            ? "bg-emerald-500"
            : pct > 0.2
              ? "bg-yellow-500"
              : "bg-red-500";

    return (
        <div className="rounded-xl bg-black/80 px-3 py-2 shadow-lg backdrop-blur-sm select-none min-w-[180px]">
            <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-xs font-medium text-white/60 tracking-wide uppercase">
                    NYC Subway
                </span>
                <span className="text-xs text-white/50">
                    −{eliminated.toLocaleString()} eliminated
                </span>
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className={cn("text-2xl font-bold tabular-nums leading-none", countColor)}>
                    {activeCount.toLocaleString()}
                </span>
                <span className="text-sm text-white/60">
                    / {TOTAL} stations
                </span>
            </div>
            {/* Progress bar: full = all stations remain, empty = all eliminated */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                <div
                    className={cn("h-full rounded-full transition-all duration-500", barColor)}
                    style={{ width: `${Math.max(pct * 100, 1)}%` }}
                />
            </div>
        </div>
    );
};
