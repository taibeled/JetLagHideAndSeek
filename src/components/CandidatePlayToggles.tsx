import type { Feature, Point } from "geojson";
import { Loader2 } from "lucide-react";
import type * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";

const candidateName = (candidate: Feature<Point>) =>
    String((candidate.properties as { name?: string })?.name ?? "");

/**
 * The "… in play" checklist shared by the airport and facility questions: an
 * alphabetised list of Overpass candidates, each of which the host can drop
 * out of play. Callers supply how a candidate is identified and labelled.
 */
export const CandidatePlayToggles = <T extends string>({
    candidates,
    loading,
    enabled,
    disabledOffMessage,
    emptyMessage,
    heading,
    description,
    refFor,
    disabledRefs,
    onToggle,
    renderLabel,
    disabled,
}: {
    candidates: Feature<Point>[];
    loading: boolean;
    /** False while hiding zones are off, i.e. before candidates can load. */
    enabled: boolean;
    disabledOffMessage: string;
    emptyMessage: string;
    heading: string;
    description: string;
    refFor: (candidate: Feature<Point>) => T;
    disabledRefs: Set<T>;
    onToggle: (ref: T, inPlay: boolean) => void;
    renderLabel: (ref: T, name: string) => React.ReactNode;
    disabled?: boolean;
}) => (
    <SidebarMenuItem
        className={`${MENU_ITEM_CLASSNAME} flex-col items-stretch gap-2`}
    >
        {!enabled ? (
            <p className="text-xs text-muted-foreground px-1">
                {disabledOffMessage}
            </p>
        ) : loading ? (
            <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
        ) : candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">{emptyMessage}</p>
        ) : (
            <>
                <Label className="text-xs font-semibold">{heading}</Label>
                <p className="text-xs text-muted-foreground">{description}</p>
                <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-md border border-border p-2">
                    {[...candidates]
                        .sort((a, b) =>
                            candidateName(a).localeCompare(candidateName(b)),
                        )
                        .map((candidate) => {
                            const ref = refFor(candidate);
                            const name = candidateName(candidate) || ref;
                            const inPlay = !disabledRefs.has(ref);

                            return (
                                <label
                                    key={ref}
                                    className="flex cursor-pointer items-start gap-2 text-xs"
                                >
                                    <Checkbox
                                        className="mt-0.5"
                                        checked={inPlay}
                                        onCheckedChange={(v) =>
                                            onToggle(ref, v === true)
                                        }
                                        disabled={disabled}
                                    />
                                    <span className="min-w-0 leading-snug">
                                        {renderLabel(ref, name)}
                                    </span>
                                </label>
                            );
                        })}
                </div>
            </>
        )}
    </SidebarMenuItem>
);
