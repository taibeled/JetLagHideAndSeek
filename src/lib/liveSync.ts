import { toast } from "react-toastify";

import {
    appendTeamSnapshot,
    computeSidFromCanonicalUtf8,
    normalizeCasBaseUrl,
    putBlob,
} from "@/lib/cas";
import {
    casServerEffectiveUrl,
    casServerStatus,
    currentSid,
    hidingZone,
    liveSyncEnabled,
    questions,
    team,
} from "@/lib/context";
import { compress } from "@/lib/utils";
import { buildWireV1Envelope, canonicalize } from "@/lib/wire";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let uploadSeq = 0;
let started = false;
let lastErrorToastAt = 0;

/** Suppress CAS uploads while hydrating from a shared URL. */
export let isHydrating = false;

export function setHydrating(value: boolean) {
    isHydrating = value;
}

function warnCasThrottled(message: string) {
    const now = Date.now();
    if (now - lastErrorToastAt < 30_000) return;
    lastErrorToastAt = now;
    toast.warn(message);
}

function cloneForWire(value: unknown): Record<string, unknown> {
    try {
        return structuredClone(value) as Record<string, unknown>;
    } catch {
        return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    }
}

/** `drag === true` means the question is unlocked (still being edited); CAS waits until all are locked. */
function anyQuestionUnlocked(): boolean {
    return questions.get().some((q) => q.data.drag);
}

function resetIdleCheckpoint(serverBase: string) {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        idleTimer = null;
        void postIdleCheckpoint(serverBase);
    }, 5000);
}

async function postIdleCheckpoint(serverBase: string) {
    if (casServerStatus.get() !== "available") return;
    const t = team.get();
    const sid = currentSid.get();
    if (!t || !sid) return;
    try {
        await appendTeamSnapshot(serverBase, t.id, sid);
    } catch (e) {
        warnCasThrottled(`Team timeline sync failed: ${e}`);
    }
}

function scheduleUpload() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    if (anyQuestionUnlocked()) return;

    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void runUpload(false);
    }, 750);
}

async function runUpload(force: boolean): Promise<void> {
    if (typeof window === "undefined") return;
    if (isHydrating) return;
    if (!force && anyQuestionUnlocked()) return;
    if (casServerStatus.get() !== "available") return;
    if (!liveSyncEnabled.get()) return;
    const rawBase = casServerEffectiveUrl.get();
    if (!rawBase) return;
    const base = normalizeCasBaseUrl(rawBase);

    const hz = hidingZone.get();
    const wire = buildWireV1Envelope(cloneForWire(hz));
    const canonicalUtf8 = canonicalize(wire);
    const sid = await computeSidFromCanonicalUtf8(canonicalUtf8);
    if (sid === currentSid.get()) return;

    const seq = ++uploadSeq;
    let compressed: string;
    try {
        compressed = await compress(canonicalUtf8);
    } catch (e) {
        warnCasThrottled(`CAS compress failed: ${e}`);
        return;
    }

    try {
        await putBlob(base, compressed, sid);
    } catch (e) {
        warnCasThrottled(`CAS upload failed: ${e}`);
        return;
    }

    if (seq !== uploadSeq) return;

    currentSid.set(sid);
    const path = window.location.pathname;
    window.history.replaceState(
        {},
        "",
        `${path}?sid=${encodeURIComponent(sid)}`,
    );

    resetIdleCheckpoint(base);
}

/** Subscribe to state changes once; safe to call multiple times (no-op after first). */
export function initLiveSync() {
    if (started) return;
    started = true;
    hidingZone.subscribe(() => scheduleUpload());
    casServerStatus.subscribe(() => scheduleUpload());
    liveSyncEnabled.subscribe(() => scheduleUpload());
}

/** Flush debounced upload immediately (e.g. before copying share URL). Bypasses the “all questions locked” gate. */
export async function flushLiveSync(): Promise<void> {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    await runUpload(true);
}
