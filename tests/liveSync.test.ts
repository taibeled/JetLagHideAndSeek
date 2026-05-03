import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isHydrating, setHydrating } from "@/lib/liveSync";

vi.mock("react-toastify", () => ({
    toast: { warn: vi.fn() },
}));

vi.mock("@/lib/cas", () => ({
    putBlob: vi.fn(),
    computeSidFromCanonicalUtf8: vi
        .fn()
        .mockResolvedValue("TEST_SID_1234567890AB"),
    appendTeamSnapshot: vi.fn(),
    normalizeCasBaseUrl: vi.fn((url: string) => url.replace(/\/+$/, "")),
}));

vi.mock("@/lib/utils", async () => {
    const actual =
        await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
    return {
        ...actual,
        compress: vi.fn().mockResolvedValue("compressed-payload"),
    };
});

// ── Dynamic imports (fresh module per test) ──────────────────────
let initLiveSync: () => void;
let flushLiveSync: () => Promise<void>;
let dynSetHydrating: (v: boolean) => void;

beforeEach(async () => {
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no fetch")));
    vi.stubGlobal("window", {
        location: { pathname: "/test" },
        history: { replaceState: vi.fn() },
    });

    const mod = await import("@/lib/liveSync");
    initLiveSync = mod.initLiveSync;
    flushLiveSync = mod.flushLiveSync;
    dynSetHydrating = mod.setHydrating;

    const { polyGeoJSON } = await import("@/lib/context");
    polyGeoJSON.set({
        type: "FeatureCollection",
        features: [],
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
});

// ── Shared helpers ────────────────────────────────────────────────
function makeLockedQ() {
    return {
        id: "radius" as const,
        key: 1,
        data: { lat: 35, lng: 135, drag: false, radius: 50, unit: "miles" as const, within: true },
    };
}

function makeUnlockedQ() {
    return {
        id: "radius" as const,
        key: 2,
        data: { lat: 35, lng: 135, drag: true, radius: 50, unit: "miles" as const, within: true },
    };
}

async function seedStandard() {
    const {
        questions,
        casServerStatus,
        liveSyncEnabled,
        casServerEffectiveUrl,
    } = await import("@/lib/context");
    questions.set([makeLockedQ()]);
    casServerStatus.set("available");
    liveSyncEnabled.set(true);
    casServerEffectiveUrl.set("http://test");
}

async function getMocks() {
    const cas = await import("@/lib/cas");
    return {
        putBlob: cas.putBlob as ReturnType<typeof vi.fn>,
        computeSid: cas.computeSidFromCanonicalUtf8 as ReturnType<typeof vi.fn>,
        appendTeamSnapshot: cas.appendTeamSnapshot as ReturnType<typeof vi.fn>,
    };
}

// ── Existing tests ────────────────────────────────────────────────
describe("liveSync hydration gate", () => {
    it("setHydrating toggles exported flag", () => {
        setHydrating(true);
        expect(isHydrating).toBe(true);
        setHydrating(false);
        expect(isHydrating).toBe(false);
    });
});

// ── New tests ─────────────────────────────────────────────────────
describe("liveSync upload pipeline", () => {
    // 1. initLiveSync subscribes to hidingZone
    it("initLiveSync subscribes to hidingZone", async () => {
        await seedStandard();
        initLiveSync();

        // Flush init-triggered immediate-subscription debounce, then reset
        await vi.advanceTimersByTimeAsync(750);
        const { putBlob } = await getMocks();
        expect(putBlob).toHaveBeenCalledTimes(1); // init upload
        putBlob.mockClear();
        const { currentSid } = await import("@/lib/context");
        currentSid.set(null);

        // State change via hidingZone dependency triggers a new upload
        const { questions } = await import("@/lib/context");
        questions.set([{ ...makeLockedQ(), key: 99 }]);
        await vi.advanceTimersByTimeAsync(750);
        expect(putBlob).toHaveBeenCalledTimes(1);
    });

    // 2. initLiveSync is idempotent
    it("initLiveSync is idempotent (only one subscription)", async () => {
        await seedStandard();
        initLiveSync();
        initLiveSync(); // second call should be a no-op

        // Flush init-triggered debounce
        await vi.advanceTimersByTimeAsync(750);
        const { putBlob } = await getMocks();
        expect(putBlob).toHaveBeenCalledTimes(1); // single subscription → one upload
        putBlob.mockClear();
        const { currentSid } = await import("@/lib/context");
        currentSid.set(null);

        // State change triggers upload
        const { questions } = await import("@/lib/context");
        questions.set([{ ...makeLockedQ(), key: 99 }]);
        await vi.advanceTimersByTimeAsync(750);
        expect(putBlob).toHaveBeenCalledTimes(1);
    });

    // 3. all locked, CAS available, sync enabled → upload after 750ms
    it("uploads after 750ms debounce when all conditions met", async () => {
        await seedStandard();
        initLiveSync();

        // Flush init-triggered debounce, then reset SID so state change is not deduped
        await vi.advanceTimersByTimeAsync(750);
        const { putBlob } = await getMocks();
        expect(putBlob).toHaveBeenCalledTimes(1); // init upload
        putBlob.mockClear();
        const { currentSid } = await import("@/lib/context");
        currentSid.set(null);

        // State change triggers new upload after 750ms debounce
        const { questions } = await import("@/lib/context");
        questions.set([{ ...makeLockedQ(), key: 42 }]);

        expect(putBlob).not.toHaveBeenCalled(); // not yet — debounce pending
        await vi.advanceTimersByTimeAsync(750);
        expect(putBlob).toHaveBeenCalledTimes(1);
    });

    // 4. unlocked question → no upload
    it("does not upload when any question has drag=true", async () => {
        await seedStandard();
        const { questions } = await import("@/lib/context");
        questions.set([makeUnlockedQ(), makeLockedQ()]);

        initLiveSync();

        questions.set([{ ...makeUnlockedQ(), key: 99 }, makeLockedQ()]);

        await vi.advanceTimersByTimeAsync(750);
        const { putBlob } = await getMocks();
        expect(putBlob).not.toHaveBeenCalled();
    });

    // 5. liveSyncEnabled false → no upload
    it("does not upload when liveSyncEnabled is false", async () => {
        const { questions, liveSyncEnabled } = await import("@/lib/context");
        questions.set([makeLockedQ()]);
        liveSyncEnabled.set(false);
        const { casServerStatus, casServerEffectiveUrl } = await import(
            "@/lib/context"
        );
        casServerStatus.set("available");
        casServerEffectiveUrl.set("http://test");

        initLiveSync();
        questions.set([{ ...makeLockedQ(), key: 77 }]);

        await vi.advanceTimersByTimeAsync(750);
        const { putBlob } = await getMocks();
        expect(putBlob).not.toHaveBeenCalled();
    });

    // 6. CAS unavailable → no upload
    it("does not upload when casServerStatus is not available", async () => {
        const { questions, casServerStatus } = await import("@/lib/context");
        questions.set([makeLockedQ()]);
        casServerStatus.set("unavailable");
        const { liveSyncEnabled, casServerEffectiveUrl } = await import(
            "@/lib/context"
        );
        liveSyncEnabled.set(true);
        casServerEffectiveUrl.set("http://test");

        initLiveSync();
        questions.set([{ ...makeLockedQ(), key: 88 }]);

        await vi.advanceTimersByTimeAsync(750);
        const { putBlob } = await getMocks();
        expect(putBlob).not.toHaveBeenCalled();
    });

    // 7. flushLiveSync uploads despite unlocked questions
    it("flushLiveSync uploads despite unlocked questions", async () => {
        await seedStandard();
        const { questions } = await import("@/lib/context");
        questions.set([makeUnlockedQ()]);

        initLiveSync();

        await flushLiveSync();
        const { putBlob } = await getMocks();
        expect(putBlob).toHaveBeenCalledTimes(1);
    });

    // 8. flushLiveSync clears pending debounce
    it("flushLiveSync clears pending debounce timer", async () => {
        await seedStandard();
        initLiveSync();

        const { questions } = await import("@/lib/context");
        questions.set([{ ...makeLockedQ(), key: 55 }]);

        await vi.advanceTimersByTimeAsync(300);
        await flushLiveSync();

        // advance past the original 750ms mark
        await vi.advanceTimersByTimeAsync(500);
        const { putBlob } = await getMocks();
        expect(putBlob).toHaveBeenCalledTimes(1);
    });

    // 9. dedup: SID matches currentSid → no upload
    it("deduplicates when SID matches currentSid", async () => {
        await seedStandard();
        const { currentSid } = await import("@/lib/context");
        currentSid.set("TEST_SID_1234567890AB");

        initLiveSync();

        const { questions } = await import("@/lib/context");
        questions.set([{ ...makeLockedQ(), key: 33 }]);

        await vi.advanceTimersByTimeAsync(750);
        const { putBlob } = await getMocks();
        expect(putBlob).not.toHaveBeenCalled();
    });

    // 10. URL updated via window.history.replaceState
    it("updates window.history.replaceState on successful upload", async () => {
        await seedStandard();
        initLiveSync();

        const { questions } = await import("@/lib/context");
        questions.set([{ ...makeLockedQ(), key: 22 }]);

        await vi.advanceTimersByTimeAsync(750);
        expect(window.history.replaceState).toHaveBeenCalledWith(
            {},
            "",
            "/test?sid=TEST_SID_1234567890AB",
        );
    });

    // 11. setHydrating(true) blocks upload
    it("setHydrating(true) blocks upload", async () => {
        await seedStandard();
        dynSetHydrating(true);
        initLiveSync();

        const { questions } = await import("@/lib/context");
        questions.set([{ ...makeLockedQ(), key: 11 }]);

        await vi.advanceTimersByTimeAsync(750);
        const { putBlob } = await getMocks();
        expect(putBlob).not.toHaveBeenCalled();
    });

    // 12. upload failure does not crash or update SID
    it("handles upload failure without updating SID", async () => {
        await seedStandard();
        const { putBlob } = await getMocks();
        putBlob.mockRejectedValueOnce(new Error("boom"));

        initLiveSync();
        const { questions, currentSid } = await import("@/lib/context");
        questions.set([{ ...makeLockedQ(), key: 44 }]);

        await vi.advanceTimersByTimeAsync(750);
        expect(putBlob).toHaveBeenCalledTimes(1);
        expect(currentSid.get()).toBeNull();
    });

    // 13. uploadSeq concurrency guard
    it("only the last upload SID wins (uploadSeq guard)", async () => {
        await seedStandard();
        initLiveSync();

        const { questions, currentSid } = await import("@/lib/context");
        const { putBlob, computeSid } = await getMocks();

        // First upload: slow putBlob
        let resolveFirst: (() => void) | null = null;
        const firstPromise = new Promise<void>((r) => {
            resolveFirst = r;
        });
        putBlob.mockImplementationOnce(() => firstPromise);
        const SID_SECOND = "SID_SECOND_BBBBBBBBBBBB";
        computeSid
            .mockResolvedValueOnce("SID_FIRST_AAAAAAAAAAAAAA")
            .mockResolvedValueOnce(SID_SECOND);

        // Trigger first upload
        questions.set([{ ...makeLockedQ(), key: 1 }]);
        await vi.advanceTimersByTimeAsync(750);

        // PutBlob back to normal for second upload
        putBlob.mockResolvedValueOnce(undefined);

        // Trigger second upload
        questions.set([{ ...makeLockedQ(), key: 2 }]);
        await vi.advanceTimersByTimeAsync(750);

        // Resolve first putBlob
        resolveFirst!();
        await vi.runAllTimersAsync();

        // Only the second SID should be persisted
        expect(currentSid.get()).toBe(SID_SECOND);
    });

    // 14. idle checkpoint → appendTeamSnapshot
    it("schedules idle checkpoint and calls appendTeamSnapshot", async () => {
        await seedStandard();
        const { team } = await import("@/lib/context");
        team.set({ id: "TEAM_ID_1234567890AB", name: "TestTeam" });

        initLiveSync();

        const { questions } = await import("@/lib/context");
        questions.set([{ ...makeLockedQ(), key: 7 }]);

        await vi.advanceTimersByTimeAsync(750);

        const { putBlob, appendTeamSnapshot } = await getMocks();
        expect(putBlob).toHaveBeenCalledTimes(1);

        // Verify SID was set by the upload
        const { currentSid: csid } = await import("@/lib/context");
        expect(csid.get()).toBe("TEST_SID_1234567890AB");

        // Idle checkpoint timer: 5000ms after successful upload
        await vi.advanceTimersByTimeAsync(5000);
        expect(appendTeamSnapshot).toHaveBeenCalledWith(
            "http://test",
            "TEAM_ID_1234567890AB",
            "TEST_SID_1234567890AB",
        );
    });
});
