/**
 * Persistent map overlay showing how many metro-area rail + subway stations
 * remain inside the current playable territory.
 *
 * Covers: NYC Subway, MTA LIRR, MTA Metro-North, NJ Transit (rail + light
 * rail), SEPTA, Amtrak, and Hartford Line — useful for NJ/NY/CT/PA games.
 *
 * Shows the full station count on load (before any question), then updates
 * reactively every time a question is applied and the territory is recomputed.
 */

import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { useMemo } from "react";

import { METRO_AREA_RAIL_STATIONS } from "@/data/metro-area-rail-stations";
import { NYC_MAJOR_SUBWAY_STATIONS } from "@/data/nyc-subway-major-stations";
import { playableTerritoryUnion } from "@/lib/context";
import { cn } from "@/lib/utils";

// Combine subway + metro rail into one flat list for counting.
// Each entry just needs { lat, lng } for the point-in-polygon check.
const ALL_STATIONS = [
    ...NYC_MAJOR_SUBWAY_STATIONS.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        system: "Subway" as const,
    })),
    ...METRO_AREA_RAIL_STATIONS.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        system: s.system,
    })),
];

const TOTAL = ALL_STATIONS.length;

// Display-friendly label for each system key. Subway is the curated
// "major stations" set (same data the bundled-stations flow uses), not the
// full ~470-station system — qualify the label so the count isn't read as
// "every subway station".
const SYSTEM_LABEL: Record<string, string> = {
    Subway: "NYC Subway (major)",
    LIRR: "LIRR",
    MNR: "Metro-North",
    NJT: "NJ Transit",
    NJLR: "NJ Light Rail",
    SEPTA: "SEPTA",
    Amtrak: "Amtrak",
    HartfordLine: "Hartford Line",
};

export const StationCountIndicator = () => {
    const $territory = useStore(playableTerritoryUnion);

    const { activeCount, bySystem } = useMemo(() => {
        // No territory yet (no questions applied) — show full count.
        if (!$territory) {
            const bySystem: Record<string, number> = {};
            for (const s of ALL_STATIONS) {
                bySystem[s.system] = (bySystem[s.system] ?? 0) + 1;
            }
            return { activeCount: TOTAL, bySystem };
        }

        const bySystem: Record<string, number> = {};
        let activeCount = 0;

        for (const s of ALL_STATIONS) {
            if (
                turf.booleanPointInPolygon(
                    turf.point([s.lng, s.lat]),
                    $territory,
                )
            ) {
                activeCount++;
                bySystem[s.system] = (bySystem[s.system] ?? 0) + 1;
            }
        }

        return { activeCount, bySystem };
    }, [$territory]);

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

    // Only show per-system rows that still have stations remaining
    const activeSystems = Object.entries(bySystem)
        .filter(([, n]) => n > 0)
        .sort(([, a], [, b]) => b - a);

    return (
        <div className="rounded-xl bg-black/80 px-3 py-2 shadow-lg backdrop-blur-sm select-none min-w-[200px]">
            {/* Header */}
            <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-xs font-medium text-white/60 tracking-wide uppercase">
                    Metro Rail
                </span>
                <span className="text-xs text-white/50">
                    −{eliminated.toLocaleString()} eliminated
                </span>
            </div>

            {/* Big count */}
            <div className="flex items-baseline gap-1.5">
                <span
                    className={cn(
                        "text-2xl font-bold tabular-nums leading-none",
                        countColor,
                    )}
                >
                    {activeCount.toLocaleString()}
                </span>
                <span className="text-sm text-white/60">
                    / {TOTAL.toLocaleString()} stations
                </span>
            </div>

            {/* Progress bar */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                <div
                    className={cn(
                        "h-full rounded-full transition-all duration-500",
                        barColor,
                    )}
                    style={{ width: `${Math.max(pct * 100, 1)}%` }}
                />
            </div>

            {/* Per-system breakdown (only when narrowed down enough to be readable) */}
            {activeSystems.length > 0 && activeSystems.length <= 6 && (
                <div className="mt-2 space-y-0.5 border-t border-white/10 pt-1.5">
                    {activeSystems.map(([sys, n]) => (
                        <div
                            key={sys}
                            className="flex justify-between text-[11px] text-white/50"
                        >
                            <span>{SYSTEM_LABEL[sys] ?? sys}</span>
                            <span className="tabular-nums">{n}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
