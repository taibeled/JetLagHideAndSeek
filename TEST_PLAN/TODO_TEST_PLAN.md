# TODO: Comprehensive Testing Plan

This document catalogs testing gaps beyond Playwright/React component tests in
`TODO-playwright-tests.md`. Focus: state management, CAS sync, question pipelines,
pure functions, server boundaries, and wire stability.

---

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

---

## Tier 1 — Critical Risk / High Impact

### 1. Live Sync Upload Pipeline — `src/lib/liveSync.ts`

**Why**: State loss in the CAS upload pipeline = lost sharing. Currently only `isHydrating`
flag toggle is tested (12 lines). The upload pipeline has debounce, SID deduplication,
hydration gates, unlocked-question guards, and browser URL updates. Test through the
public API (`initLiveSync`, `flushLiveSync`, `setHydrating`) by seeding atoms and
observing side effects — the internal pipeline functions (`anyQuestionUnlocked`,
`scheduleUpload`, `runUpload`, `postIdleCheckpoint`) are private.

**Atoms used by liveSync**: `hidingZone`, `questions`, `casServerEffectiveUrl`, `casServerStatus`,
`liveSyncEnabled`, `currentSid`, `team`.

**What to test** (mocked `fetch`, fake timers via `vi.useFakeTimers()`, atom seeding):

| Test | Mock strategy |
|------|---------------|
| `initLiveSync()` subscribes to `hidingZone`, `casServerStatus`, `liveSyncEnabled` | Verify subscriptions exist after calling |
| `initLiveSync()` is idempotent (no-op after first call) | Call twice, verify only one subscription |
| Changing `hidingZone` when sync is enabled, CAS available, and all questions locked → upload after 750ms debounce | Seed all-locked questions, enable sync, set CAS available, advance timers, assert `putBlob` called |
| Changing `hidingZone` when any question has `data.drag === true` → no upload after debounce | Seed unlocked question, advance timers, assert `putBlob` not called |
| Changing `hidingZone` when `liveSyncEnabled` is false → no upload | Set atom false, assert `putBlob` not called |
| Changing `hidingZone` when `casServerStatus` is not `"available"` → no upload | Set `"unavailable"` or `"unknown"`, assert `putBlob` not called |
| `flushLiveSync()` uploads immediately despite unlocked questions when sync is enabled and CAS is available | Unlocked questions, call `flushLiveSync()`, assert `putBlob` called |
| `flushLiveSync()` clears pending debounce timer and uploads | Advance timer to 300ms, call `flushLiveSync()`, assert only one `putBlob` call |
| Upload deduplication: changing `hidingZone` to same content → no second `putBlob` when SID matches `currentSid` | Pre-set `currentSid`, trigger upload with same content |
| Upload updates `window.history.replaceState` with new SID in URL | Stub `window.history.replaceState` |
| Upload failure (CAS returns error) → does not crash, does not update SID | Mock `putBlob` → reject, assert `currentSid` unchanged |
| Upload dedup across rapid changes: only the last upload's SID is persisted (`uploadSeq` guard) | Trigger two rapid uploads, mock slow `putBlob` for first, assert only second SID wins |
| Successful upload schedules idle checkpoint, then calls `appendTeamSnapshot` when CAS available + team + sid exist | Seed `team`, enable sync, trigger upload, advance idle timer 5000ms |
| `setHydrating(true)` blocks uploads | Set hydrating true, trigger upload, assert `putBlob` not called |

### 2. CAS Discovery & Client Operations — `src/lib/casDiscovery.ts`, `src/lib/cas.ts`

**Why**: Zero tests. `discoverCasServer()` determines whether CAS works at all.
Missing client operations: `getBlob`, `newTeamId`, `probeHealth`.

**Actual API contracts** (verify these match the source when implementing):
- `getBlob(serverBaseUrl, sid)` returns the compressed text body, throws on non-OK (no null return on 404).
- `probeHealth(baseUrl)` aborts after ~4000ms, returns `false` on failed fetch or abort.
- `newTeamId()` uses `crypto.getRandomValues()`, returns 22-char base64url string.
- `normalizeCasBaseUrl(raw)` strips trailing slashes only.

#### `casDiscovery.ts`
| Test | Mock strategy |
|------|---------------|
| `discoverCasServer()` probes `window.location.origin` first | Stub `window.location.origin`, mock fetch → 200 on first URL |
| Falls back to `window.location.origin + Astro basePath` when origin alone fails | Mock fetch: first call 404, second 200 |
| Falls back to user-configured `casServerUrl` when basePath also fails | Set `casServerUrl` atom, mock fetch sequence |
| Sets `casServerStatus` to `"available"` when a candidate succeeds | Mock fetch → 200 |
| Sets `casServerStatus` to `"unavailable"` and `casServerEffectiveUrl` to `null` when all fail | Mock fetch → 404 for all candidates |
| Root deploy candidate behavior is explicit | With base path `/`, current implementation probes both `origin` and `origin/`; if desired behavior changes, normalize before deduping |

#### `cas.ts`
| Test | Mock strategy |
|------|---------------|
| `getBlob(baseUrl, sid)` fetches correct URL, returns compressed text body | Mock fetch → 200 with body |
| `getBlob` throws on non-OK response | Mock fetch → 404, assert throws |
| `probeHealth(url)` returns `true` on 200 response | Mock fetch → 200 |
| `probeHealth(url)` returns `false` on fetch failure or abort | Mock fetch → reject, or use fake timers |
| `newTeamId()` returns a 22-character base64url string matching `TEAM_ID_REGEX` | Mock `crypto.getRandomValues()` |
| `normalizeCasBaseUrl(raw)` strips trailing slashes | Pure function, no mocks |
| `putBlob(baseUrl, body, sid)` PUTs to correct URL with correct headers | Mock fetch, verify method/headers/body |
| `putBlob` throws on non-OK response | Mock fetch → 500 |
| `appendTeamSnapshot(baseUrl, teamId, sid)` POSTs to correct URL | Mock fetch, verify JSON body |
| `appendTeamSnapshot` rejects invalid team ID | Pass bad teamId, assert throws |
| `listTeamSnapshots(baseUrl, teamId)` returns snapshot array | Mock fetch → JSON with `snapshots` array |

### 3. Question Processing Pipeline — `src/maps/index.ts`

**Why**: Zero direct tests. 139 lines of pure dispatch logic. Core app orchestration.

**Target file**: New `src/maps/index.test.ts` (not `matching.test.ts`).

| Test | Mock strategy |
|------|---------------|
| `applyQuestionsToMapGeoData` calls each question's adjust function in order when `planningModeEnabled` is `false` | Mock imported question-type adjusters, verify call order |
| Skips unlocked (`drag: true`) questions when `planningModeEnabled` is `true` | Pass `planningModeEnabled=true`, set `drag: true`, assert adjuster not called for that question |
| For each locked question in planning mode, the callback receives the question's planning polygon and the question itself before elimination | Mock imported planning-polygon generators, verify callback args |
| Wraps non-FeatureCollection results in FeatureCollection | Return plain GeoJSON `Feature` from mock, assert result is `{ type: "FeatureCollection", features: [feature] }` |
| `adjustMapGeoDataForQuestion` dispatches to correct adjust function by matching type | Map of type→function, verify correct dispatch |
| `hiderifyQuestion` dispatches to correct hiderify function by matching type | Map of type→function, verify correct dispatch |
| `hiderifyQuestion` only hiderifies questions with `drag: true` (unlocked) | Set some locked, some unlocked, verify only unlocked processed |
| `determinePlanningPolygon` dispatches to correct planning polygon generator by type | Verify geometry returned |

### 4. Question-Type Logic — `radius.ts`, `thermometer.ts`

**Why**: Zero tests. Small, mostly pure Turf geometry. Form the elimination backbone.
No network dependencies for these — just `hiderMode` atom reads.

**New files**: `src/maps/questions/radius.test.ts`, `src/maps/questions/thermometer.test.ts`.

#### `radius.test.ts`
| Test | Strategy |
|------|----------|
| `adjustPerRadius` applies the radius buffer to `mapData` through `modifyMapData()` | Known center + radius, verify features retained/removed for `within: true` and `within: false` |
| `adjustPerRadius` uses `modifyMapData()` — intersects for `within: true`, subtracts for `within: false` | Test with sample features inside and outside the buffer |
| `hiderifyRadius` sets `question.within = true` when hider is inside radius | Set `hiderMode` atom inside radius |
| `hiderifyRadius` sets `question.within = false` when hider is outside radius | Set `hiderMode` atom outside radius |
| `radiusPlanningPolygon` returns the line boundary of the radius circle (via `polygonToLine`) | Verify `LineString`/line feature geometry, not polygon |

#### `thermometer.test.ts`
| Test | Strategy |
|------|----------|
| `adjustPerThermometer` intersects map data with the correct Voronoi region based on `warmer` | Known `latA/lngA/latB/lngB`, set `warmer`, verify feature is retained/dropped based on side |
| `hiderifyThermometer` sets `warmer = true` when hider is in point B's Voronoi region | Set `hiderMode` atom closer to `latB,lngB` than `latA,lngA` |
| `hiderifyThermometer` sets `warmer = false` when hider is in point A's Voronoi region | Set `hiderMode` atom closer to `latA,lngA` than `latB,lngB` |
| `thermometerPlanningPolygon` returns Voronoi boundary line features | Verify geometry is line, not circle/polygon |

---

## Tier 2 — Important Coverage Gaps

### 5. Server API Edge Cases — `server/src/app.ts`

**Why**: Validation boundaries that protect server storage. Already have Fastify
`inject()` pattern in `server/tests/blobs.test.ts`.

**Target files**: `server/src/app.ts`, `server/src/blobStorage.ts`, `server/src/teamStore.ts`,
`server/src/decompress.ts`, `server/src/sid.ts`.

**`buildApp()` contract**: `buildApp({ dataDir, maxCanonicalBytes, maxCompressedBodyBytes, maxTeamEntries, corsOrigin })` — see `server/tests/blobs.test.ts:21-27`.

**Expand `server/tests/blobs.test.ts`**:

| Test | Strategy |
|------|----------|
| PUT rejects invalid SID path param (doesn't match `SID_PATTERN` regex) | `inject({ url: "/api/cas/blobs/invalid sid" })`, expect 400 |
| PUT rejects when recomputed SID doesn't match the path param | Send compressed canonical payload whose SID differs from URL |
| PUT rejects payload larger than `maxCompressedBodyBytes` | Send oversized body, expect 413 |
| PUT rejects invalid compressed payload (not valid deflate) | Send plain text, expect 400 |
| PUT rejects valid deflate with invalid JSON | Deflate `"not json"`, expect 400 |
| PUT rejects schema-invalid wire JSON (e.g. missing required `v` field) | Deflate valid JSON without `v`, expect 400 |
| PUT accepts the same canonical payload at the same SID twice, and GET returns that payload | PUT twice with identical canonical content at the same SID, verify GET returns it |
| PUT rejects different content at the same SID (payload SID mismatch) | PUT with body whose canonical SID differs from URL path param, expect 400 |
| GET returns 404 for non-existent SID | `inject({ url: "/api/cas/blobs/AAAAAAAAAAAAAAAAAAAAAA" })` (valid-looking 22-char SID) |

**Expand `server/tests/teams.test.ts`**:

| Test | Strategy |
|------|----------|
| POST rejects when referenced blob SID doesn't exist | POST to non-existent SID, expect 404 or 400 |
| POST appends then GET returns all entries in order | Two POSTs with different SIDs, GET asserts both |
| Enforces `maxTeamEntries` limit | POST repeatedly until limit exceeded, expect rejection |
| POST rejects invalid team ID (doesn't match `TEAM_ID_REGEX`) | POST with `teamId: "bad"` |
| POST rejects invalid SID in body | POST with `{ sid: "invalid" }` |

### 6. State Hydration Edge Cases — `src/lib/loadHidingZone.ts`

**Why**: Complex deserialization with many branches. Legacy payloads, preset imports,
auto-enable logic.

| Test | Strategy |
|------|----------|
| `loadHidingZoneFromJsonString` with legacy (non-v1) payload still works | Pass plain object without `v: 1` |
| `applyHidingZoneGeojson` with `properties.questions` populates questions store | Construct GeoJSON with questions under properties |
| `displayHidingZones` auto-enables for detecting-zone mode | Verify atom is true after load |
| Preset import generates fallback ID when preset has no name | Import unnamed preset |
| `stripWireEnvelope` extracts team from snapshot correctly | Pass snapshot with team field |
| `stripWireEnvelope` returns null team when snapshot has no team | Pass snapshot without team |

### 7. Custom Presets CRUD — `src/lib/context.ts`

**Why**: Zero tests. Pure state transitions on Nanostores atoms.

**New file**: `tests/customPresets.test.ts`.

| Test | Strategy |
|------|----------|
| `saveCustomPreset()` adds a preset to `customPresets` store and returns its generated `id` | Direct atom get/set, verify returned id |
| `updateCustomPreset(id, updates)` updates only the matching preset | Modify then verify |
| `updateCustomPreset(unknownId, updates)` leaves the store unchanged | Pass non-existent id, verify store unchanged |
| `deleteCustomPreset(id)` removes only the matching preset | Verify count and content |
| `deleteCustomPreset(unknownId)` leaves the store unchanged | Pass non-existent id, verify store unchanged |
| Preset store persists to localStorage | Mock localStorage via `InMemoryStorage` |
| Preset store recovers from localStorage on init | Pre-populate localStorage, init store |

### 8. Wire/CAS Full Round-Trip — `tests/casGameStateSettings.test.ts`

**Why**: Only partially covered — settings roundtrip works, but not the full question set.

| Test | Strategy |
|------|----------|
| `buildWireV1Envelope` + wire roundtrip preserves questions with all passthrough fields | Build envelope with questions, parse back |
| Roundtrip preserves `selectedTrainLineId` through wire | Include same-train-line question in bundle |
| Roundtrip preserves custom presets | Include presets in the envelope |
| `applyHidingZoneGeojson` with `isHidingZone` flag processes questions under `properties` | GeoJSON with `isHidingZone: true` |

---

## Tier 3 — Pure Function Quick Wins

### 9. Schema Roundtrip Tests — `src/maps/schema.ts`

**Why**: Only `matchingQuestionSchema` tested. Other schemas need parse roundtrip
to prevent wire-format regressions. Test through the **exported** `questionsSchema`
(individual type schemas like `radiusQuestionSchema` and `thermometerQuestionSchema`
are not exported). Exported: `tentacleQuestionSchema`, `matchingQuestionSchema`,
`measuringQuestionSchema`, `questionSchema`, `questionsSchema`, `determineUnionizedStrings`,
`NO_GROUP`.

**New file**: `tests/questionSchemas.test.ts`

| Schema | Minimum test |
|--------|-------------|
| Parse radius question via `questionsSchema` | `{ id: "radius", key: 0, data: { lat, lng, radius, unit, within } }` |
| Parse thermometer question via `questionsSchema` | `{ id: "thermometer", key: 0, data: { latA, lngA, latB, lngB, warmer } }` |
| Parse tentacle question via `questionsSchema` | `{ id: "tentacles", key: 0, data: { lat, lng, radius, unit, locationType, location } }` |
| Parse measuring question via `questionsSchema` | Ordinary: `{ id: "measuring", key: 0, data: { lat, lng, type: "coastline", unit } }`; Custom: `{ id: "measuring", key: 0, data: { lat, lng, type: "custom-measure", unit, geo } }` |
| `questionsSchema` parses array of mixed question types | Array with radius + matching + thermometer |
| `questionsSchema` rejects unknown `id` | `{ id: "bogus", ... }` → throws |
| Verify default values are populated when fields omitted | Parse question with minimal fields, check defaults |
| `determineUnionizedStrings` returns correct descriptions | Pass matching schema union, verify output |
| Color field defaults to a valid color when omitted | Parse question without `color`, assert color is non-empty string |

### 10. Utility Pure Functions

**New file**: `tests/utils.test.ts` for `src/lib/utils.ts`:
- `cn(...inputs)` — Tailwind className merge (truthy, falsy, conditional)
- `mapToObj(entries, fn)` — maps array to key-value object
- `normalizeCasBaseUrl(url)` — trailing slash removal only

**New file**: `src/maps/geo-utils/operators-tags.test.ts`:
- `normalizeOsmText(value)` returns a trimmed non-empty string or `undefined`; it does not lowercase
- `expandFiltersForOperatorNetwork(baseFilter, alternatives, operatorFilter)` returns `{ primaryLines, alternativeLines }`; test regex escaping indirectly by passing operator/network strings with regex metacharacters
- `escapeOverpassRegexPattern(text)` is private — test escaping behavior through `expandFiltersForOperatorNetwork`; if direct tests are desired, export it first

### 11. Station/Label Helpers — `src/maps/geo-utils/special.ts`

**New file**: `src/maps/geo-utils/special.test.ts`:
- `extractStationName(feature, "english-preferred")` → returns English name
- `extractStationName(feature, "native-preferred")` → returns native name
- `extractStationLabel(feature, strategy)` → label with name fallback
- `lngLatToText([lng, lat])` → formats coordinates with degree symbols and hemisphere suffixes
- Test fallback through `extractStationLabel(feature, strategy)` where the feature has no station names and uses `geometry.coordinates`
- `groupObjects(objects)` → groups by name:en/name/network with union-find

### 12. Server Standalone Unit Tests

**New file**: `server/tests/sid.test.ts`:
- `computeSidFromCanonicalUtf8(canonicalUtf8)` returns a stable 22-character SID for a known canonical string (uses Node's `crypto.createHash`, no mock needed)
- `computeSidFromCanonicalUtf8()` returns the same SID for identical input and different SIDs for different input
- `SID_PATTERN` matches valid 22-character base64url SIDs and rejects invalid strings

**New file**: `server/tests/decompress.test.ts`:
- `decompressDeflateBase64Url(encoded)` → roundtrip with known input
- Handles invalid base64 gracefully (returns empty, throws, or specific error)

---

## Tier 4 — Long-Term Investment

### 13. Snapshot / Golden Tests for SID Stability

**Why**: Wire format changes can break existing shared URLs. Expanding `wire.fixture.test.ts`
pattern provides regression safety.

**New fixtures in `tests/fixtures/`**:
- `wire-radius.json` — single radius question, golden SID
- `wire-thermometer.json` — single thermometer question, golden SID
- `wire-same-train-line.json` — same-train-line with `selectedTrainLineId`, golden SID
- `wire-multi-question.json` — 3+ questions of mixed types, golden SID

**Test pattern** (same as existing `wire.fixture.test.ts`):
1. Parse fixture with `wireV1SnapshotSchema.parse()`
2. `canonicalize()` to sorted UTF-8
3. `computeSidFromCanonicalUtf8()` to derive SID
4. Assert SID matches golden value

### 14. Performance Benchmarks

**Why**: Large datasets (many questions, many stations, complex geometry) can degrade UX.

**New file**: `tests/benchmark.test.ts` (use `describe.skip` or a separate Vitest config):

| Benchmark | Input | Threshold |
|-----------|-------|-----------|
| `applyQuestionsToMapGeoData` with 10 questions | 10 matching questions on country-level geometry | <500ms |
| Station discovery with 500 stations | 500 station circles + 3 matching questions | <2s |
| `safeUnion` on 100 overlapping polygons | 100 random polygons in same area | <1s |
| `canonicalize` on full wire payload | Full snapshot with 10 questions + settings | <10ms |
| Coastline loading + processing | `coastline50.geojson` (~3.9 MB) | <1s parse |

### 15. Accessibility

**Why**: Known issue in AGENTS.md — Radix dialog missing `aria-describedby`.

When component test infra is set up (Playwright or RTL + jsdom), add:
- `@axe-core/react` or `jest-axe` configuration
- Running axe scan on the full page (TutorialDialog, OptionDrawers)
- Assert no violations (with known exceptions documented)

### 16. PWA Validation

**Why**: Service worker misconfiguration could break offline behavior or cache API routes.

**Approach**: Build-output assertions (no browser needed):
- `dist/sw.js` exists and imports `workbox-*.js`
- `dist/sw.js` contains `NetworkOnly` for `/api/cas/` and `/api/teams/`
- `dist/manifest.webmanifest` has valid `name`, `start_url`, `icons`
- Precache manifest includes key static assets (index.html, JS bundles)

---

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

---

## Summary: Effort vs Impact

| # | Area | Effort | Impact | New files |
|---|------|--------|--------|-----------|
| 1 | Live sync | Medium | Critical | Expand `tests/liveSync.test.ts` |
| 2 | CAS discovery + client | Low | Critical | `tests/casDiscovery.test.ts`, expand `tests/cas.test.ts` |
| 3 | Question pipeline | Medium | High | `src/maps/index.test.ts` |
| 4 | Radius/thermometer | Low | High | `src/maps/questions/radius.test.ts`, `thermometer.test.ts` |
| 5 | Server edges | Low | High | Expand `server/tests/blobs.test.ts`, `teams.test.ts` |
| 6 | State hydration | Medium | Medium | Expand `tests/casGameStateSettings.test.ts` |
| 7 | Presets CRUD | Low | Medium | `tests/customPresets.test.ts` |
| 8 | Wire round-trip | Low | Medium | Expand `tests/casGameStateSettings.test.ts` |
| 9 | Schema tests | Low | Medium | `tests/questionSchemas.test.ts` |
| 10 | Pure utils | Low | Low | `tests/utils.test.ts`, `operators-tags.test.ts` |
| 11 | Station helpers | Low | Low | `src/maps/geo-utils/special.test.ts` |
| 12 | Server units | Low | Low | `server/tests/sid.test.ts`, `decompress.test.ts` |
| 13 | Snapshot SIDs | Medium | Medium | New fixtures + expand `tests/wire.fixture.test.ts` |
| 14 | Benchmarks | Medium | Low | `tests/benchmark.test.ts` |
| 15 | Accessibility | Medium | Low | N/A (needs component infra) |
| 16 | PWA | Low | Low | `tests/pwa.test.ts` |

The first 8 items (Tiers 1-2) add the most practical protection for the least test-specific
infrastructure investment — no DOM, no browser, just mocked fetch + Nanostores atoms + Turf geometry.
