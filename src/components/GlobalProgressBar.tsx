import { useStore } from "@nanostores/react";

import { isLoading } from "@/lib/context";
import { progressTasksAtom } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { cancelInFlightRequests } from "@/maps/api/cache";

/**
 * Abort every in-flight request and return the UI to idle. Used by the cancel
 * button so a player who fat-fingered a huge query can bail instead of waiting
 * out the full per-query timeout budget.
 */
function cancelAllAndReset() {
    cancelInFlightRequests();
    isLoading.set(false);
    progressTasksAtom.set([]);
}

/**
 * Fixed top-of-viewport progress bar that surfaces background tasks
 * (detailed boundary upgrade, GTFS import, reachability compute, …).
 *
 * - Renders nothing when no tasks are active.
 * - If any task is indeterminate, shows a sweeping shimmer bar.
 * - Otherwise shows the mean of reported fractions; clamped to `>= 5%` so
 *   the bar is visible even right after a task starts.
 * - Flashes red if any task errors, then auto-hides.
 */
export function GlobalProgressBar() {
    const tasks = useStore(progressTasksAtom);
    // Many Overpass/boundary fetches only flip `isLoading` (and show a toast)
    // without registering a task, so subscribe to it too — otherwise the
    // Cancel button would be missing during exactly those long requests.
    const loading = useStore(isLoading);

    if (tasks.length === 0 && !loading) return null;

    const anyIndeterminate =
        tasks.some((t) => t.status === "running" && t.progress === null) ||
        (tasks.length === 0 && loading);
    const anyError = tasks.some((t) => t.status === "error");

    // Determinate tasks contribute to the visual fraction; indeterminate ones
    // don't, but their presence alone flips us into shimmer mode.
    const determinate = tasks.filter(
        (t) => t.status === "running" && typeof t.progress === "number",
    );
    const meanFraction =
        determinate.length > 0
            ? determinate.reduce((a, t) => a + (t.progress ?? 0), 0) /
              determinate.length
            : 0;
    const percent = Math.max(5, Math.min(100, meanFraction * 100));

    // Show the most recently started task's label as the primary caption,
    // falling back to a generic one when only `isLoading` is set.
    const primaryLabel = tasks.length > 0 ? tasks[tasks.length - 1].label : "Loading…";

    return (
        <div className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none">
            <div
                className={cn(
                    "h-1 w-full overflow-hidden transition-colors duration-200",
                    anyError ? "bg-red-500/20" : "bg-blue-500/20",
                )}
            >
                {anyIndeterminate && !anyError ? (
                    <div
                        role="progressbar"
                        aria-label={primaryLabel}
                        aria-busy="true"
                        className="h-full w-[40%] bg-blue-500 animate-progress-indeterminate"
                    />
                ) : (
                    <div
                        role="progressbar"
                        aria-label={primaryLabel}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(percent)}
                        className={cn(
                            "h-full transition-all duration-200 ease-out",
                            anyError ? "bg-red-500" : "bg-blue-500",
                        )}
                        style={{ width: `${percent}%` }}
                    />
                )}
            </div>
            <div className="flex justify-end px-3 pt-1">
                <div
                    className={cn(
                        "pointer-events-auto flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium shadow-md backdrop-blur",
                        anyError
                            ? "bg-red-50/95 text-red-700 dark:bg-red-950/90 dark:text-red-200"
                            : "bg-white/95 text-slate-700 dark:bg-slate-900/90 dark:text-slate-200",
                    )}
                >
                    <span>
                        {primaryLabel}
                        {tasks.length > 1 && (
                            <span className="ml-1 opacity-60">
                                +{tasks.length - 1}
                            </span>
                        )}
                    </span>
                    {!anyError && (
                        <button
                            type="button"
                            onClick={cancelAllAndReset}
                            className="rounded border border-current/30 px-1.5 py-0.5 text-[11px] font-semibold opacity-70 transition-opacity hover:opacity-100"
                            aria-label="Cancel loading"
                            title="Stop all in-flight requests"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
