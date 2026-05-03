# Phase 2: Important Coverage Gaps

## 5. Server API Edge Cases — `server/src/app.ts`

**Why**: Validation boundaries that protect server storage. Already have Fastify
`inject()` pattern in `server/tests/blobs.test.ts`.

**Target files**: `server/src/app.ts`, `server/src/blobStorage.ts`, `server/src/teamStore.ts`,
`server/src/decompress.ts`, `server/src/sid.ts`.

**`buildApp()` contract**: `buildApp({ dataDir, maxCanonicalBytes, maxCompressedBodyBytes, maxTeamEntries, corsOrigin })` — see `server/tests/blobs.test.ts:21-27`.

### Expand `server/tests/blobs.test.ts`

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

### Expand `server/tests/teams.test.ts`

| Test | Strategy |
|------|----------|
| POST rejects when referenced blob SID doesn't exist | POST to non-existent SID, expect 404 or 400 |
| POST appends then GET returns all entries in order | Two POSTs with different SIDs, GET asserts both |
| Enforces `maxTeamEntries` limit | POST repeatedly until limit exceeded, expect rejection |
| POST rejects invalid team ID (doesn't match `TEAM_ID_REGEX`) | POST with `teamId: "bad"` |
| POST rejects invalid SID in body | POST with `{ sid: "invalid" }` |

## 6. State Hydration Edge Cases — `src/lib/loadHidingZone.ts`

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

## 7. Custom Presets CRUD — `src/lib/context.ts`

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

## 8. Wire/CAS Full Round-Trip — `tests/casGameStateSettings.test.ts`

**Why**: Only partially covered — settings roundtrip works, but not the full question set.

| Test | Strategy |
|------|----------|
| `buildWireV1Envelope` + wire roundtrip preserves questions with all passthrough fields | Build envelope with questions, parse back |
| Roundtrip preserves `selectedTrainLineId` through wire | Include same-train-line question in bundle |
| Roundtrip preserves custom presets | Include presets in the envelope |
| `applyHidingZoneGeojson` with `isHidingZone` flag processes questions under `properties` | GeoJSON with `isHidingZone: true` |
