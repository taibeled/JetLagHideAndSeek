/**
 * Transit Systems manager dialog.
 *
 * Lists imported GTFS feeds and lets the user add/remove them. Importing
 * runs in-thread (GTFS parse is synchronous via fflate + papaparse); the
 * UI updates progress via the `onProgress` callback on `parseGtfs`.
 *
 * Minimal per-row UI for now: name, stop count, delete. Storage usage,
 * enable toggles, and last-refreshed come in Phase 5 polish.
 *
 * Curated presets (NYCT, LIRR, MNR, NJT, SLE) slot into the empty
 * presets section and come in the follow-up p4-presets task.
 */
import { Globe, Loader2, Plus, Trash2, Upload } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorTask, finishTask, startTask, updateTask } from "@/lib/progress";
import { rebuildAutoTransfers } from "@/lib/transit/auto-transfers";
import { fetchGtfsZip, looksLikeZip } from "@/lib/transit/cors-proxy";
import { parseGtfs } from "@/lib/transit/gtfs-parser";
import {
    deleteSystem,
    estimateUsage,
    listSystems,
    writeSystemBulk,
} from "@/lib/transit/gtfs-store";
import {
    type ByoUrlPreset,
    GTFS_PRESETS,
    type GtfsPreset,
} from "@/lib/transit/presets";
import { reachabilityClient } from "@/lib/transit/reachability-client";
import type { ImportProgress, TransitSystem } from "@/lib/transit/types";
import { cn } from "@/lib/utils";

interface TransitSystemsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Slugify a user-supplied name into a systemId. Collisions are handled by
 * the caller appending `-2`, `-3`, etc.
 */
function slugify(name: string): string {
    return (
        name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "system"
    );
}

async function uniqueSystemId(base: string): Promise<string> {
    const existing = await listSystems();
    const taken = new Set(existing.map((s) => s.id));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 1000; i++) {
        const candidate = `${base}-${i}`;
        if (!taken.has(candidate)) return candidate;
    }
    // Absurd fallback — user has 1000 collisions. Use a random suffix.
    return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Human label for a progress phase. Kept short — lives inside a small
 * status line, not a full log.
 */
function phaseLabel(phase: ImportProgress["phase"]): string {
    switch (phase) {
        case "fetching":
            return "Downloading feed";
        case "unzipping":
            return "Unzipping";
        case "parsing-stops":
            return "Parsing stops";
        case "parsing-routes":
            return "Parsing routes";
        case "parsing-trips":
            return "Parsing trips";
        case "parsing-stop-times":
            return "Parsing stop times";
        case "parsing-calendar":
            return "Parsing calendar";
        case "parsing-transfers":
            return "Parsing transfers";
        case "storing":
            return "Saving to device";
        case "done":
            return "Done";
    }
}

function isAbortError(e: unknown): boolean {
    return (
        (e instanceof Error && e.name === "AbortError") ||
        (e instanceof DOMException && e.name === "AbortError")
    );
}

function formatStorageBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    const units = ["KB", "MB", "GB"] as const;
    let v = n;
    let i = -1;
    do {
        v /= 1024;
        i++;
    } while (v >= 1024 && i < units.length - 1);
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function TransitSystemsDialog({
    open,
    onOpenChange,
}: TransitSystemsDialogProps) {
    const [systems, setSystems] = useState<TransitSystem[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [nameInput, setNameInput] = useState("");
    const [progress, setProgress] = useState<ImportProgress | null>(null);
    const [storageInfo, setStorageInfo] = useState<{
        usage?: number;
        quota?: number;
    } | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    /** True only while a URL zip download is in flight (not unzip/parse/store). */
    const [downloadInFlight, setDownloadInFlight] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const guardedOpenChange = useCallback(
        (next: boolean) => {
            if (!next && downloadInFlight) return;
            onOpenChange(next);
        },
        [downloadInFlight, onOpenChange],
    );

    // Fetch list every time the dialog opens — IDB is the source of truth
    // and other paths (presets, auto-refresh) may have mutated it.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        estimateUsage()
            .then((s) => {
                if (!cancelled) setStorageInfo(s);
            })
            .catch(() => {
                if (!cancelled) setStorageInfo(null);
            });
        // Reset to loading state before the IDB read resolves.

        setSystems(null);
        listSystems()
            .then((s) => {
                if (!cancelled) {
                    // Sort by most-recently imported first.
                    s.sort((a, b) => b.importedAt - a.importedAt);
                    setSystems(s);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    console.log("Failed to list transit systems:", err);
                    toast.error("Couldn't read saved transit systems");
                    setSystems([]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    // Abort any in-flight fetch when the dialog closes.
    useEffect(() => {
        if (!open && abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
    }, [open]);

    const refreshList = async () => {
        const s = await listSystems();
        s.sort((a, b) => b.importedAt - a.importedAt);
        setSystems(s);
    };

    const handleImport = async (
        source:
            | {
                  kind: "url";
                  url: string;
                  /**
                   * If set, use this as the system id verbatim (skips the
                   * slug + collision search). Presets pin their id so
                   * "already installed?" checks work across sessions.
                   */
                  systemId?: string;
                  /** Override display name (also from presets). */
                  name?: string;
              }
            | { kind: "file"; file: File },
    ) => {
        if (loading) return;

        const overrideName = source.kind === "url" ? source.name : undefined;
        const rawName =
            overrideName ||
            nameInput.trim() ||
            (source.kind === "file"
                ? source.file.name.replace(/\.zip$/i, "")
                : source.url
                      .split("/")
                      .pop()
                      ?.replace(/\.zip.*$/i, "") || "Imported system");

        const systemId =
            source.kind === "url" && source.systemId
                ? source.systemId
                : await uniqueSystemId(slugify(rawName));

        setLoading(true);
        setProgress({ phase: "fetching", fraction: 0, message: "" });

        // Mirror import progress into the global top-of-viewport bar so the
        // flow is visible even if the user closes the dialog mid-import.
        const taskId = startTask({
            label: `Importing ${rawName}…`,
            progress: 0,
        });
        const onProgress = (p: ImportProgress) => {
            setProgress(p);
            const label = p.message
                ? `${phaseLabel(p.phase)} — ${p.message}`
                : phaseLabel(p.phase);
            updateTask(taskId, {
                label: `${rawName}: ${label}`,
                progress: p.fraction,
            });
        };

        try {
            let bytes: ArrayBuffer;
            let importMethod: TransitSystem["importMethod"];

            if (source.kind === "file") {
                const buf = await source.file.arrayBuffer();
                if (!looksLikeZip(buf)) {
                    throw new Error(
                        "That file doesn't look like a GTFS zip (missing zip header).",
                    );
                }
                bytes = buf;
                importMethod = "upload";
            } else {
                abortRef.current = new AbortController();
                setDownloadInFlight(true);
                try {
                    let result: Awaited<ReturnType<typeof fetchGtfsZip>>;
                    try {
                        result = await fetchGtfsZip(
                            source.url,
                            (loaded, total) => {
                                onProgress({
                                    phase: "fetching",
                                    fraction: total
                                        ? Math.min(0.1, (loaded / total) * 0.1)
                                        : 0.05,
                                    message: `${(loaded / 1024 / 1024).toFixed(1)} MB`,
                                });
                            },
                            abortRef.current.signal,
                        );
                    } catch (e) {
                        if (isAbortError(e)) {
                            finishTask(taskId);
                            setProgress(null);
                            return;
                        }
                        throw e;
                    }
                    if (!looksLikeZip(result.bytes)) {
                        throw new Error(
                            "Server returned non-zip content. The URL may require a different fetch method — try downloading manually and uploading the zip.",
                        );
                    }
                    bytes = result.bytes;
                    importMethod = result.method;
                } finally {
                    setDownloadInFlight(false);
                    abortRef.current = null;
                }
            }

            const parsed = await parseGtfs(bytes, {
                systemId,
                name: rawName,
                sourceUrl: source.kind === "url" ? source.url : undefined,
                importMethod,
                onProgress,
            });

            onProgress({ phase: "storing", fraction: 0.9 });
            await writeSystemBulk({
                system: parsed.system,
                stops: parsed.stops,
                routes: parsed.routes,
                trips: parsed.trips,
                stopTimes: parsed.tripStopTimes,
                services: parsed.services,
                transfers: parsed.gtfsTransfers,
            });

            // Auto-transfers cross systems, so rebuild after every add.
            // Don't block the UI on this — the system is already saved.
            onProgress({ phase: "done", fraction: 1 });
            rebuildAutoTransfers().catch((err) => {
                console.log("Auto-transfer rebuild failed:", err);
            });
            // Force the RAPTOR worker to drop its cached graph so the
            // next reachability query sees the new feed.
            reachabilityClient.invalidate();

            finishTask(taskId);
            toast.success(
                `Imported ${parsed.system.name} (${parsed.stops.length.toLocaleString()} stops)`,
            );
            setUrlInput("");
            setNameInput("");
            if (fileInputRef.current) fileInputRef.current.value = "";
            await refreshList();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log("GTFS import failed:", err);
            errorTask(taskId);
            toast.error(`Import failed: ${msg}`, {
                toastId: "gtfs-import-error",
                autoClose: 8000,
            });
        } finally {
            setLoading(false);
            setProgress(null);
            if (abortRef.current) abortRef.current = null;
        }
    };

    const handleDelete = async (system: TransitSystem) => {
        if (deleting) return;
        // Match the existing confirm pattern elsewhere in the app.
        if (
            !window.confirm(
                `Remove "${system.name}"? This deletes all its stops, trips, and schedules from your device.`,
            )
        ) {
            return;
        }
        setDeleting(system.id);
        try {
            await deleteSystem(system.id);
            toast.success(`Removed ${system.name}`);
            // Transfers cross systems; rebuild after delete too.
            rebuildAutoTransfers().catch((err) => {
                console.log("Auto-transfer rebuild failed:", err);
            });
            reachabilityClient.invalidate();
            await refreshList();
        } catch (err) {
            console.log("Delete system failed:", err);
            toast.error("Couldn't remove that system");
        } finally {
            setDeleting(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={guardedOpenChange}>
            <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Transit systems</DialogTitle>
                    <DialogDescription>
                        Import GTFS feeds to enable reachability filtering.
                        Feeds are stored on your device and never sent to a
                        server.
                    </DialogDescription>
                </DialogHeader>

                {/* Installed systems list */}
                <div className="flex-1 overflow-y-auto space-y-4 py-2">
                    <section>
                        <h3 className="text-sm font-semibold mb-2">
                            Installed
                        </h3>
                        {systems === null ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading…
                            </div>
                        ) : systems.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">
                                No feeds imported yet. Add one below.
                            </p>
                        ) : (
                            <ul className="space-y-1">
                                {systems.map((s) => (
                                    <li
                                        key={s.id}
                                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">
                                                {s.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {s.stopCount.toLocaleString()}{" "}
                                                stops ·{" "}
                                                {new Date(
                                                    s.importedAt,
                                                ).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDelete(s)}
                                            disabled={
                                                deleting === s.id || loading
                                            }
                                            aria-label={`Remove ${s.name}`}
                                        >
                                            {deleting === s.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Curated presets */}
                    <section>
                        <h3 className="text-sm font-semibold mb-2">
                            Curated presets
                        </h3>
                        <ul className="space-y-2">
                            {GTFS_PRESETS.map((preset) => (
                                <PresetCard
                                    key={preset.id}
                                    preset={preset}
                                    installed={
                                        systems?.some(
                                            (s) => s.id === preset.id,
                                        ) ?? false
                                    }
                                    disabled={loading}
                                    onInstall={(urlOverride) =>
                                        handleImport({
                                            kind: "url",
                                            url:
                                                urlOverride ??
                                                (preset.kind === "public"
                                                    ? preset.url
                                                    : ""),
                                            systemId: preset.id,
                                            name: preset.name,
                                        })
                                    }
                                />
                            ))}
                        </ul>
                    </section>

                    {/* Import from URL / file */}
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold">Add a feed</h3>

                        <div className="space-y-1.5">
                            <Label
                                htmlFor="transit-name"
                                className="text-xs font-medium"
                            >
                                Name (optional)
                            </Label>
                            <Input
                                id="transit-name"
                                placeholder="e.g. Boston MBTA Rail"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label
                                htmlFor="transit-url"
                                className="text-xs font-medium"
                            >
                                GTFS zip URL
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    id="transit-url"
                                    placeholder="https://…/google_transit.zip"
                                    value={urlInput}
                                    onChange={(e) =>
                                        setUrlInput(e.target.value)
                                    }
                                    disabled={loading}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" &&
                                            urlInput.trim()
                                        ) {
                                            handleImport({
                                                kind: "url",
                                                url: urlInput.trim(),
                                            });
                                        }
                                    }}
                                />
                                <Button
                                    onClick={() =>
                                        handleImport({
                                            kind: "url",
                                            url: urlInput.trim(),
                                        })
                                    }
                                    disabled={!urlInput.trim() || loading}
                                >
                                    <Globe className="h-4 w-4 mr-1.5" />
                                    Fetch
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">
                                …or upload a zip
                            </Label>
                            <div className="flex gap-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".zip,application/zip"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            handleImport({
                                                kind: "file",
                                                file,
                                            });
                                        }
                                    }}
                                    disabled={loading}
                                />
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                    disabled={loading}
                                    className="w-full"
                                >
                                    <Upload className="h-4 w-4 mr-1.5" />
                                    Choose GTFS zip…
                                </Button>
                            </div>
                        </div>

                        {progress && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>
                                        {phaseLabel(progress.phase)}
                                        {progress.message
                                            ? ` · ${progress.message}`
                                            : ""}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full bg-primary transition-all duration-200",
                                        )}
                                        style={{
                                            width: `${Math.round(
                                                Math.max(
                                                    0,
                                                    Math.min(
                                                        1,
                                                        progress.fraction,
                                                    ),
                                                ) * 100,
                                            )}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-col items-stretch">
                    {storageInfo?.usage != null && (
                        <p className="text-[11px] text-muted-foreground text-left order-first">
                            Browser storage (approx.):{" "}
                            {formatStorageBytes(storageInfo.usage)}
                            {storageInfo.quota != null
                                ? ` / ${formatStorageBytes(storageInfo.quota)}`
                                : ""}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                            variant="outline"
                            onClick={() => guardedOpenChange(false)}
                            disabled={downloadInFlight}
                        >
                            {downloadInFlight
                                ? "Downloading…"
                                : loading
                                  ? "Importing…"
                                  : "Close"}
                        </Button>
                        {downloadInFlight && abortRef.current && (
                            <Button
                                variant="ghost"
                                onClick={() => abortRef.current?.abort()}
                            >
                                Cancel download
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * One preset row. Renders as an install card for `public` presets and as
 * an expandable URL-input card for `byo-url` ones. Once the matching
 * system id is in IDB, the card shows "Installed" and a refresh button.
 */
function PresetCard({
    preset,
    installed,
    disabled,
    onInstall,
}: {
    preset: GtfsPreset;
    installed: boolean;
    disabled: boolean;
    onInstall: (urlOverride?: string) => void;
}) {
    const [byoUrl, setByoUrl] = useState("");

    const header = (
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
                <span className="font-medium truncate">{preset.name}</span>
                {installed && (
                    <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">
                        Installed
                    </span>
                )}
            </div>
            <div className="text-xs text-muted-foreground">
                {preset.agency} · {preset.region}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-4">
                {preset.description}
            </p>
        </div>
    );

    if (preset.kind === "public") {
        return (
            <li className="rounded-md border px-3 py-2 flex items-start gap-2">
                {header}
                <div className="flex flex-col gap-1 items-end shrink-0">
                    <Button
                        size="sm"
                        variant={installed ? "outline" : "default"}
                        onClick={() => onInstall()}
                        disabled={disabled}
                    >
                        {installed ? "Refresh" : "Install"}
                    </Button>
                    {preset.licenseUrl && (
                        <a
                            href={preset.licenseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-muted-foreground underline hover:text-foreground"
                        >
                            Terms
                        </a>
                    )}
                </div>
            </li>
        );
    }

    // byo-url
    const byoPreset = preset as ByoUrlPreset;
    const canInstall = byoUrl.trim().length > 0;
    return (
        <li className="rounded-md border px-3 py-2 flex flex-col gap-2">
            <div className="flex items-start gap-2">{header}</div>
            <p className="text-xs text-amber-500 leading-4">
                {byoPreset.reason}{" "}
                <a
                    href={byoPreset.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                >
                    Get a URL →
                </a>
            </p>
            <div className="flex gap-2">
                <Input
                    placeholder="Paste your GTFS zip URL"
                    value={byoUrl}
                    onChange={(e) => setByoUrl(e.target.value)}
                    disabled={disabled}
                    className="h-8"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && canInstall) {
                            onInstall(byoUrl.trim());
                        }
                    }}
                />
                <Button
                    size="sm"
                    variant={installed ? "outline" : "default"}
                    onClick={() => onInstall(byoUrl.trim())}
                    disabled={disabled || !canInstall}
                >
                    {installed ? "Refresh" : "Install"}
                </Button>
            </div>
            {byoPreset.licenseUrl && (
                <a
                    href={byoPreset.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-muted-foreground underline hover:text-foreground self-end"
                >
                    Terms
                </a>
            )}
        </li>
    );
}

/**
 * Compact inline trigger you can drop anywhere. Keeps the dialog's state
 * self-contained so callers don't have to wire `open` manually.
 */
export function TransitSystemsButton({
    className,
    variant = "outline",
    children,
}: {
    className?: string;
    variant?: React.ComponentProps<typeof Button>["variant"];
    children?: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button
                variant={variant}
                className={className}
                onClick={() => setOpen(true)}
                type="button"
            >
                <Plus className="h-4 w-4 mr-1.5" />
                {children ?? "Manage transit systems"}
            </Button>
            <TransitSystemsDialog open={open} onOpenChange={setOpen} />
        </>
    );
}
