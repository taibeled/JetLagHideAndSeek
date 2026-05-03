# Phase 1: Critical Risk / High Impact

## 1. Live Sync Upload Pipeline — `src/lib/liveSync.ts`

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

## 2. CAS Discovery & Client Operations — `src/lib/casDiscovery.ts`, `src/lib/cas.ts`

**Why**: Zero tests. `discoverCasServer()` determines whether CAS works at all.
Missing client operations: `getBlob`, `newTeamId`, `probeHealth`.

**Actual API contracts** (verify these match the source when implementing):
- `getBlob(serverBaseUrl, sid)` returns the compressed text body, throws on non-OK (no null return on 404).
- `probeHealth(baseUrl)` aborts after ~4000ms, returns `false` on failed fetch or abort.
- `newTeamId()` uses `crypto.getRandomValues()`, returns 22-char base64url string.
- `normalizeCasBaseUrl(raw)` strips trailing slashes only.

### `casDiscovery.ts`

| Test | Mock strategy |
|------|---------------|
| `discoverCasServer()` probes `window.location.origin` first | Stub `window.location.origin`, mock fetch → 200 on first URL |
| Falls back to `window.location.origin + Astro basePath` when origin alone fails | Mock fetch: first call 404, second 200 |
| Falls back to user-configured `casServerUrl` when basePath also fails | Set `casServerUrl` atom, mock fetch sequence |
| Sets `casServerStatus` to `"available"` when a candidate succeeds | Mock fetch → 200 |
| Sets `casServerStatus` to `"unavailable"` and `casServerEffectiveUrl` to `null` when all fail | Mock fetch → 404 for all candidates |
| Root deploy candidate behavior — with base path `/`, BASE_URL normalizes to empty and candidates dedupe, probing only `origin` | Stub BASE_URL to `/`, mock probeHealth → true, assert only `origin` probed |

### `cas.ts`

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

## 3. Question Processing Pipeline — `src/maps/index.ts`

**Why**: Zero direct tests. 139 lines of pure dispatch logic. Core app orchestration.

**Target file**: New `src/maps/index.test.ts` (not `matching.test.ts`).

| Test | Mock strategy |
|------|---------------|
| `applyQuestionsToMapGeoData` calls each question's adjust function in order when `planningModeEnabled` is `false` | Mock imported question-type adjusters, verify call order |
| Skips unlocked (`drag: true`) questions when `planningModeEnabled` is `true` | Pass `planningModeEnabled=true`, set `drag: true`, assert adjuster not called for that question |
| For each unlocked question in planning mode, the callback receives the question's planning polygon and the question itself before elimination is skipped | Mock imported planning-polygon generators, verify callback args |
| Wraps non-FeatureCollection results in FeatureCollection | Return plain GeoJSON `Feature` from mock, assert result is `{ type: "FeatureCollection", features: [feature] }` |
| `adjustMapGeoDataForQuestion` dispatches to correct adjust function by matching type | Map of type→function, verify correct dispatch |
| `hiderifyQuestion` dispatches to correct hiderify function by matching type | Map of type→function, verify correct dispatch |
| `hiderifyQuestion` only hiderifies questions with `drag: true` (unlocked) | Set some locked, some unlocked, verify only unlocked processed |
| `determinePlanningPolygon` dispatches to correct planning polygon generator by type | Verify geometry returned |

## 4. Question-Type Logic — `radius.ts`, `thermometer.ts`

**Why**: Zero tests. Small, mostly pure Turf geometry. Form the elimination backbone.
No network dependencies for these — just `hiderMode` atom reads.

**New files**: `src/maps/questions/radius.test.ts`, `src/maps/questions/thermometer.test.ts`.

### `radius.test.ts`

| Test | Strategy |
|------|----------|
| `adjustPerRadius` applies the radius buffer to `mapData` through `modifyMapData()` | Known center + radius, verify features retained/removed for `within: true` and `within: false` |
| `adjustPerRadius` uses `modifyMapData()` — intersects for `within: true`, subtracts for `within: false` | Test with sample features inside and outside the buffer |
| `hiderifyRadius` sets `question.within = true` when hider is inside radius | Set `hiderMode` atom inside radius |
| `hiderifyRadius` sets `question.within = false` when hider is outside radius | Set `hiderMode` atom outside radius |
| `radiusPlanningPolygon` returns the line boundary of the radius circle (via `polygonToLine`) | Verify `LineString`/line feature geometry, not polygon |

### `thermometer.test.ts`

| Test | Strategy |
|------|----------|
| `adjustPerThermometer` intersects map data with the correct Voronoi region based on `warmer` | Known `latA/lngA/latB/lngB`, set `warmer`, verify feature is retained/dropped based on side |
| `hiderifyThermometer` sets `warmer = true` when hider is in point B's Voronoi region | Set `hiderMode` atom closer to `latB,lngB` than `latA,lngA` |
| `hiderifyThermometer` sets `warmer = false` when hider is in point A's Voronoi region | Set `hiderMode` atom closer to `latA,lngA` than `latB,lngB` |
| `thermometerPlanningPolygon` returns Voronoi boundary line features | Verify geometry is line, not circle/polygon |
