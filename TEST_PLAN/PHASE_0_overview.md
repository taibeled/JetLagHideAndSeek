# Phase 0: Overview

This document catalogs testing gaps beyond Playwright/React component tests in
`TODO-playwright-tests.md`. Focus: state management, CAS sync, question pipelines,
pure functions, server boundaries, and wire stability.

## Existing Testing Infrastructure

| What | Where | How |
|------|-------|-----|
| Unit tests | `tests/*.test.ts`, `src/**/*.test.ts` | Vitest |
| Server integration | `server/tests/*.test.ts` | Vitest + Fastify `inject()` |
| Mock fetch | `tests/cas.test.ts` | `vi.stubGlobal("fetch", mock)` + `vi.unstubAllGlobals()` |
| Mock localStorage | `tests/questionsPersistenceLoad.test.ts` | `InMemoryStorage` + `vi.stubGlobal("localStorage", ...)` |
| Mock modules | `src/lib/context.playAreaMode.test.ts` | `vi.mock("@/maps/api", ...)` |
| Atom reads/writes | Across test files | Direct `.set()` / `.get()` on Nanostores atoms |
| Turf geometry | Across test files | `turf.point()`, `turf.polygon()`, `turf.featureCollection()` |
| Wire fixture | `tests/fixtures/wire-v1.json` | Golden SID lock test |

Run: `pnpm test` (frontend), `pnpm --dir server test` (server).

## Mock Patterns Reference

### Pattern A: Mock fetch for CAS calls
```ts
import { vi } from "vitest";

const mockFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 })
);
vi.stubGlobal("fetch", mockFetch);
// ... run test ...
vi.unstubAllGlobals();
```

### Pattern B: Mock localStorage
```ts
class InMemoryStorage implements Storage {
    _data = new Map<string, string>();
    getItem(key: string) { return this._data.get(key) ?? null; }
    setItem(key: string, value: string) { this._data.set(key, value); }
    removeItem(key: string) { this._data.delete(key); }
    clear() { this._data.clear(); }
    get length() { return this._data.size; }
    key(_index: number) { return null; }
}
const storage = new InMemoryStorage();
vi.stubGlobal("localStorage", storage);
```

### Pattern C: Fake timers for debounce tests
```ts
vi.useFakeTimers();
// trigger debounced function
vi.advanceTimersByTime(1000);
// assert side effects
vi.useRealTimers();
```

### Pattern D: Atom seeding for context-dependent tests
```ts
import { questions, hiderMode, liveSyncEnabled, casServerStatus } from "@/lib/context";

questions.set([
    { id: "matching", key: 0, data: { type: "same-train-line", lat: 35, lng: 139, same: true, drag: false } }
]);
hiderMode.set({ latitude: 35.6, longitude: 139.7 });
liveSyncEnabled.set(true);
casServerStatus.set("available");
```

### Pattern E: Fastify inject() for server tests
```ts
const app = await buildApp({
    dataDir,
    maxCanonicalBytes: 1024 * 1024,
    maxCompressedBodyBytes: 2 * 1024 * 1024,
    maxTeamEntries: 100,
    corsOrigin: true,
});
await app.ready();
const res = await app.inject({
    method: "PUT",
    url: `/api/cas/blobs/${sid}`,
    headers: { "content-type": "text/plain; charset=utf-8" },
    payload: compressedBody,
});
expect(res.statusCode).toBe(200);
```

### Pattern F: Stub window globals
```ts
vi.stubGlobal("window", {
    location: { origin: "http://localhost:8787", pathname: "/JetLagHideAndSeek/" },
    history: { replaceState: vi.fn() },
});
import.meta.env.BASE_URL = "/JetLagHideAndSeek/";
```

## Summary: Effort vs Impact

| # | Area | Effort | Impact | New files | Phase |
|---|------|--------|--------|-----------|-------|
| 1 | Live sync | Medium | Critical | Expand `tests/liveSync.test.ts` | 1 |
| 2 | CAS discovery + client | Low | Critical | `tests/casDiscovery.test.ts`, expand `tests/cas.test.ts` | 1 |
| 3 | Question pipeline | Medium | High | `src/maps/index.test.ts` | 1 |
| 4 | Radius/thermometer | Low | High | `src/maps/questions/radius.test.ts`, `thermometer.test.ts` | 1 |
| 5 | Server edges | Low | High | Expand `server/tests/blobs.test.ts`, `teams.test.ts` | 2 |
| 6 | State hydration | Medium | Medium | Expand `tests/casGameStateSettings.test.ts` | 2 |
| 7 | Presets CRUD | Low | Medium | `tests/customPresets.test.ts` | 2 |
| 8 | Wire round-trip | Low | Medium | Expand `tests/casGameStateSettings.test.ts` | 2 |
| 9 | Schema tests | Low | Medium | `tests/questionSchemas.test.ts` | 3 |
| 10 | Pure utils | Low | Low | `tests/utils.test.ts`, `operators-tags.test.ts` | 3 |
| 11 | Station helpers | Low | Low | `src/maps/geo-utils/special.test.ts` | 3 |
| 12 | Server units | Low | Low | `server/tests/sid.test.ts`, `decompress.test.ts` | 3 |
| 13 | Snapshot SIDs | Medium | Medium | New fixtures + expand `tests/wire.fixture.test.ts` | 4 |
| 14 | Benchmarks | Medium | Low | `tests/benchmark.test.ts` | 4 |
| 15 | Accessibility | Medium | Low | N/A (needs component infra) | 4 |
| 16 | PWA | Low | Low | `tests/pwa.test.ts` | 4 |

The first 8 items (Phases 1-2) add the most practical protection for the least test-specific
infrastructure investment — no DOM, no browser, just mocked fetch + Nanostores atoms + Turf geometry.
