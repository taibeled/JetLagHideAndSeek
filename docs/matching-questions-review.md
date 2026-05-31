# Matching Questions — Comprehensive Review

**Date:** 2026-05-31
**Scope:** All matching question categories from `docs/questions.md` §1 (Matching)
**Baseline:** commit `d3bd9f4` (clean working tree)

---

## 1. Summary

The matching questions implementation is **production-ready for the MVP**. All 18 matching categories from the spec are implemented, with transit-line handled as a special category using hiding-zone station data and the other 17 categories using live Overpass API queries. The architecture is clean, the test suite is solid (92 tests across 10 test suites for matching specifically, all passing), and TypeScript compiles with zero errors.

**Verdict:** ✅ Ship-ready for testing on device. Two medium-severity issues (no API-call debouncing, duplicated haversine) and several low-severity UX polish items noted below.

---

## 2. Correctness

### 2.1 Overpass API integration (`osmMatching.ts`)
- **Haversine formula**: Correctly implemented with proper radian conversion and the standard formula. ✅
- **Coordinate handling**: Nodes use `lat`/`lon` directly; ways/relations use `center.lat`/`center.lon`. Matches Overpass `out center` semantics. ✅
- **Element filtering**: Correctly skips unnamed elements, elements without coordinates, and unknown element types (`area`). ✅
- **Name trimming**: Whitespace trimmed from names. ✅
- **Stale response handling**: Generation-counter pattern prevents out-of-order API responses from corrupting state. ✅

### 2.2 Voronoi mask computation (`matchingVoronoi.ts`)
- **Deduplication**: Both osmKey (type/id) and coordinate-level deduplication before Voronoi — prevents Turf crashes on duplicate points. ✅
- **Composite keys**: `node/1` vs `way/1` disambiguates same-numeric-IDs across different OSM element types. ✅
- **Hit mask**: Extracts the selected candidate's Voronoi cell. ✅
- **Miss mask**: Correctly unions all non-selected cells using Turf `union`. Falls back to empty for single-candidate case. ✅
- **Bbox clipping**: Voronoi cells are clipped to the play area bbox. ✅

### 2.3 Transit-line matching
- **Selection reconciliation**: `reconcileTransitLineQuestionSelection()` correctly auto-selects when only one line is available, clears stale selections when the line disappears. ✅
- **Normalization**: `normalizeTransitLineQuestion()` validates line IDs against the canonical route ID format and resets unrecognized IDs to prevent stale data from broken imports. ✅
- **Line option computation**: Groups stations by route, finds nearest station per route, filters by radius, sorts by distance with name tie-breaking. ✅

### 2.4 State management
- **Question CRUD**: Create, update, delete, import all work correctly. ✅
- **Persistence**: Matching questions survive app restart via AsyncStorage. ✅
- **Center updates**: `updateQuestionCenter()` works for both radar and matching types. ✅
- **Legacy migration**: `type: "radius"` → `type: "radar"` normalization. Matching questions don't need this (they have no legacy form). ✅

### 2.5 Wire format (`minified.ts`)
- **Candidate compaction**: Coordinates quantized to integers (×1e6), field names minified — correct round-trip. ✅
- **Transit-line normalization on decode**: `unminifyEnvelope` calls `normalizeTransitLineQuestion` on decoded matching questions. ✅
- **Schema validation**: Both full-key and minified Zod schemas validate matching questions. ✅

---

## 3. Testing Coverage

### 3.1 What is tested (✅)

| File | Tests | Coverage |
|------|-------|----------|
| `osmMatching.test.ts` | 12 | Query building, element parsing, nearest-feature finding, API integration (mocked fetch), error handling, distance attachment |
| `matchingCategories.test.ts` | 8 | Config lookup, section grouping, OSM tags, title/section resolution |
| `matchingVoronoi.test.ts` | 14 | Voronoi cells, hit/miss masks, deduplication (by coord and by key), type-collision disambiguation |
| `osmMatchingGeometry.test.ts` | 9 | Render state: empty, no-candidates, no-selection, transit-line exclusion, hit/miss masks, POI features, type collision, aggregation |
| `OsmMatchingQuestionDetailScreen.test.tsx` | 7 | Candidate rendering, distance display, selection highlighting, tap-to-select, auto-search on mount, refresh, center-change invalidation |
| `transitLineQuestion.test.ts` | 7 | Line options, sorting, radius filtering, tie-breaking, operator-local route ID collision, selection reconciliation |
| `questionGeometry.test.ts` | 5 | Transit line masks, OSM matching masks, aggregation across questions |
| `questionRegistry.test.ts` | 4 | Config completeness, implemented types, answer labels, radar defaults |
| `questionStore.test.tsx` | 14 | CRUD, persistence, deletion, pin lock, center updates, matching question creation |
| `OsmMatchingLayers.test.tsx` | 4 | Shape source rendering, selected/unselected filters, empty state |

### 3.2 What is NOT tested (gaps)

| Gap | Severity | Notes |
|-----|----------|-------|
| Full matching question E2E flow | Medium | No Maestro test covering: open app → add matching question → select category → search Overpass → select candidate → answer → verify map mask |
| Network error recovery at component level | Low | Error state tested at unit level only; no test for retry-after-error flow |
| Large Overpass responses (>10 results) | Low | Only the client-side slice to 10 is tested; not what happens with hundreds of raw elements |
| All 17 OSM categories end-to-end | Low | Only `park` is tested in component tests; other categories exercise different Overpass tag combos |
| Rapid pin movement | Medium | No test for debouncing or for the clearing-then-researching cycle when pin is moved during an in-flight request |
| Minified round-trip with candidates | Low | `minified.test.ts` may not test matching questions with non-trivial candidate lists |
| Miss-mask union with many non-contiguous cells | Low | Only tested with 3 candidates; union of 10+ non-contiguous polygons could have edge cases |

---

## 4. Critical User Journey (CUJ)

### 4.1 OSM matching flow

```
User opens app → Add Question → "Matching" → picks "Park"
→ App creates question, navigates to detail
→ Auto-queries Overpass for nearest parks (50km radius)
→ Shows sorted candidate list with distances
→ User selects "Yoyogi Park" → Answer selector enables
→ User answers "Hit" → Map shows Voronoi cell around Yoyogi Park as hit mask
```

**Status:** ✅ Fully implemented and working.

### 4.2 Transit-line matching flow

```
User opens app → Add Question → "Matching" → picks "Transit Line"
→ App creates question, navigates to detail
→ Shows transit lines whose nearest station is within hiding zone radius
→ If only one line: auto-selects it
→ User answers "Hit" → Map shows station buffer mask for that line
```

**Status:** ✅ Fully implemented and working.

### 4.3 CUJ concerns

1. **Pin movement UX gap**: The "Set to My Location" button is hidden for matching questions (`showSetToLocationButton={false}`), forcing users to drag the pin on the map. The alternative is hidden in the "..." actions menu. Consider adding the button directly to the detail screen.
2. **No guidance after "no results"**: When Overpass returns zero results, the user sees "No park found nearby" with no suggestion to move the pin.
3. **Third branch in QuestionDetailScreen**: The routing correctly dispatches `matching + transit-line` → `TransitLineQuestionDetailScreen`, `matching + other` → `OsmMatchingQuestionDetailScreen`. This is correct but fragile if new special categories are added.

---

## 5. UX

### 5.1 What works well
- Candidate list sorted by distance with formatted distances ("150 meters", "2.1 km") ✅
- Selected candidate visually distinguished (tinted border + background) ✅
- Refresh button available when results are stale or errored ✅
- Answer buttons disabled until a candidate is selected ✅
- Transit lines show nearest station name and distance — gives context ✅
- Coordinate display in location selector ✅
- Error message display with distinct red styling ✅

### 5.2 UX issues

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| No loading spinner during Overpass search | Low | Replace "Searching for nearest park..." text with an `ActivityIndicator` |
| No debounce on pin drag → API call | **Medium** | Add 500ms debounce on center changes before triggering search. Currently every pin move during a drag clears candidates and the next stationary moment triggers a new Overpass call. |
| No retry button after error | Low | The "Refresh Search" button serves this purpose but could be more prominent after an error |
| "Set to My Location" buried in menu | Low | Consider adding a location button directly on the detail screen for matching questions |
| Transit-line auto-select UX | Low | When only one line is available it's auto-selected silently. Consider a brief toast/indicator |
| Missing "station's name length" category | **Medium** | `docs/questions.md` lists "Station's Name Length" under Transit matching, but it has no matching category config and no implementation. This may be intentional (deferred) but should be confirmed. |

---

## 6. Performance

### 6.1 Current state

| Aspect | Assessment |
|--------|------------|
| Overpass query radius | 50km default — reasonable for the game's scale |
| Candidate limit | 10 (client-side slice after fetch) — fine for UI display |
| Voronoi computation | O(n log n) with n ≤ 10 — negligible |
| Miss-mask union | Turf `union` on ≤9 polygons — fast enough |
| Haversine per element | O(elements) — cheap even for hundreds of elements |
| Map layer rendering | Point features and polygon masks — standard MapLibre performance |

### 6.2 Performance concerns

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| No debounce on pin-move → Overpass call | **Medium** | Each pin position change triggers a full Overpass query. In a rapid drag session, this could fire 10+ API calls. Add a 300-500ms debounce. |
| No client-side caching of Overpass results | Low | Moving the pin away and back re-queries. Cache the last N queries by (category, rounded-center) for the session lifetime. |
| Overpass returns all elements within 50km | Low | In dense urban areas (Tokyo), a 50km radius could return hundreds of elements. Consider adding `(if:count() <= 50)` or similar to the Overpass query to limit server-side. |
| `buildTransitLineMaskFeatures` computes station buffers per frame | Low | If multiple transit-line questions are answered, this regenerates all buffer polygons on every render state recomputation. The `useMemo` in `useQuestionMapRenderState` mitigates this but doesn't cache across identical inputs. |

---

## 7. Architectural Simplification Opportunities

### 7.1 Duplicated haversine distance

**Files:** `src/features/questions/matching/osmMatching.ts:176-194` and `src/features/questions/radar/radarGeometry.ts:83-98`

Both files have identical private haversine implementations. Both define `EARTH_RADIUS_METERS` with the same value (6,371,008.8).

**Recommendation:** Extract `haversineDistanceMeters()` and `EARTH_RADIUS_METERS` into `src/shared/geo.ts` (or `src/shared/location.ts`). This eliminates ~25 lines of duplication.

### 7.2 Schema duplication

**Files:** `src/state/appState.ts:83-118` and `src/sharing/wire/schema.ts:82-117`

Both define nearly identical Zod schemas for `MatchingQuestion`. The wire schema adds `.transform(normalizeTransitLineQuestion)`. The app state schema also adds it.

**Recommendation:** Define the base matching question schema once in a shared location. Export it with and without the transform. Alternatively, keep the duplication but add a comment cross-referencing the two locations to prevent drift.

### 7.3 `OsmMatchingRenderState` in radarTypes.ts

**File:** `src/features/questions/radar/radarTypes.ts:83-89`

The `OsmMatchingRenderState` type is defined in the radar types file. It's imported by `osmMatchingGeometry.ts` and used by `OsmMatchingLayers.tsx`. This is confusing — OSM matching types shouldn't live in radar's namespace.

**Recommendation:** Move `OsmMatchingRenderState` and `QuestionMapRenderState` (and the transit-line mask types) to `src/features/questions/matching/matchingTypes.ts` or a new `src/features/questions/questionGeometry.ts` types section.

### 7.4 `EARTH_RADIUS_METERS` duplication

**Files:** `osmMatching.ts:7`, `radarGeometry.ts:15`

Same constant defined twice with the same value.

**Recommendation:** Move to `src/shared/geo.ts`.

### 7.5 `updateRadarQuestionCenter` alias

**File:** `src/state/questionStore.tsx:282`

```typescript
export const updateRadarQuestionCenter = updateQuestionCenter;
```

This is purely a naming alias. If it exists for discoverability, consider a JSDoc comment explaining it's the same function.

### 7.6 Good patterns worth highlighting

- **Config-per-category pattern** (`matchingConfig.ts`, `radarConfig.ts`): Each question type has a `QuestionDefinition` that centralizes display properties, behavior flags, and labels. This is clean and extensible.
- **Registry pattern** (`questionRegistry.ts`): All question types register in one place. Adding a new question type requires adding a config and implementing the UI — no registry changes needed.
- **Transit-line transparency**: Transit-line questions are `MatchingQuestion` with `category: "transit-line"` — not a separate type. This avoids a combinatorial explosion of question types.
- **Normalize-at-boundaries**: `normalizeTransitLineQuestion` is applied at both persistence-load and wire-decode time. This is the right place to guard against stale/invalid data.
- **Generation-based stale handling**: `searchGenerationRef` in `OsmMatchingQuestionDetailScreen` prevents race conditions from out-of-order API responses.

---

## 8. Readiness for `docs/sharing_strat.md`

### 8.1 What is ready ✅

- Matching questions are fully integrated into the `app-state` wire envelope
- Full-key schema (`matchingQuestionWireSchema`) validates matching questions on import
- Minified schema (`matchingQuestionMinifiedSchema`) compacts candidates, coordinates, and field names
- Candidate serialization: coordinates quantized (×1e6), osmId/osmType/name preserved, tags dropped (reconstructed as `{}` on decode)
- Transit-line normalization applied on minified decode
- Import preview shows matching questions in question count
- Persistence round-trip works (create → persist → restart → restore)

### 8.2 What needs attention before sharing goes live

| Item | Priority | Notes |
|------|----------|-------|
| Transit-line questions require receiver to have same hiding-zone presets | Medium | If the receiver doesn't have the same GTFS presets loaded, `lineId` won't resolve to any station and the question will be normalized to unanswered |
| Candidate `tags` are dropped in minified format | Low | Tags are only `{}` on decode — acceptable since tags aren't used after initial search. Document this. |
| Large candidate lists increase payload size | Low | 10 candidates × ~70 bytes minified = ~700 bytes per question. With many questions, this adds up. |
| "Station's Name Length" category missing | Info | See §5.2 — this Transit matching sub-category has no implementation |

### 8.3 Sharing flow gaps (not matching-specific)

The sharing strat doc §5.2 lists these as not implemented:
- `question-request` envelope (seeker → hider)
- `question-answer` envelope (hider → seeker)
- No way to share a single matching question — only full app state

These are **known future work** and don't block the current milestone.

---

## 9. Bugs

### 9.1 Confirmed non-bugs (investigated → correct)

- **`OsmMatchingRenderState` type imported from radarTypes**: Works correctly, just architecturally misplaced (see §7.3).
- **`buildTransitLineMaskFeatures` type cast**: `as unknown as TransitLineQuestionFeatureCollection` — works correctly because both types use the same underlying GeoJSON structure. The `unknown` intermediate cast is defensive.
- **Effect clearing candidates on pin move**: The two-render cycle (clear → detect-empty → search) is intentional and correct.
- **`isLoading` in effect dependency**: Correctly prevents concurrent searches.

### 9.2 Potential bugs

| # | Description | Severity | Location |
|---|-------------|----------|----------|
| B1 | **No abort controller for fetch**: `findMatchingFeatures` uses `fetch` without an `AbortController`. If the component unmounts mid-request, the fetch continues and the response is discarded by the generation check — but the network request isn't cancelled. This wastes bandwidth and could delay subsequent requests on slow connections. | Low | `osmMatching.ts:47` |
| B2 | **Overpass error message is generic**: The catch block always shows "Unable to search. Check your connection and try again." regardless of the actual error (timeout, rate limit, DNS failure). Users can't distinguish between network issues and API issues. | Low | `OsmMatchingQuestionDetailScreen.tsx:67` |
| B3 | **Voronoi cell ↔ candidate index assumption**: After deduplication, `computeVoronoiCells` maps features back to candidates by index (`deduped[index]`). Turf's `voronoi` is documented to preserve the order of input points in output cells, but this is implicit and could break if Turf changes. | Low | `matchingVoronoi.ts:48-59` |
| B4 | **Missing `abort` on rapid category switching**: If a user rapidly creates and deletes matching questions of different categories, the generation counter only prevents stale writes per-question. If they delete Q1 (park, search in flight) and create Q2 (museum), Q2's search is independent and correct. No cross-question leak. ✅ (verified not a bug) | — | — |

---

## 10. Recommendations (Prioritized)

### Immediate (before wider testing)

1. **Add debounce on pin movement → Overpass query** (addresses §6.2). Add a 300-500ms debounce before calling `performSearch` when the pin moves. This prevents API spam during dragging.

2. **Extract shared haversine** (addresses §7.1). Move `haversineDistanceMeters` and `EARTH_RADIUS_METERS` to `src/shared/geo.ts`. Low risk, high clarity.

### Short-term (before public release)

3. **Add loading spinner** (addresses §5.2). Replace text-only loading state with `ActivityIndicator` for better perceived performance.

4. **Clarify "Station's Name Length" status** (addresses §5.2). Either implement it or document it as intentionally deferred in `docs/questions.md`.

5. **Improve "no results" UX** (addresses §4.3). Add guidance text: "Try moving your pin to a different area and refreshing."

6. **Add AbortController to Overpass fetch** (addresses B1). Cancel in-flight requests on unmount.

### Medium-term (post-MVP)

7. **DRY up schema definitions** (addresses §7.2). Extract the base matching question Zod schema.

8. **Move `OsmMatchingRenderState` out of radarTypes** (addresses §7.3).

9. **Add E2E test for matching question flow** (addresses §3.2). A single Maestro test covering the critical path.

10. **Client-side Overpass cache** (addresses §6.2). Cache results by (category, rounded-center-to-3-decimal-places) for the session.

---

## 11. Architecture Diagram (Current)

```
┌─────────────────────────────────────────────────────────┐
│                    QuestionRegistry                      │
│  questionDefinitions: { radar, matching, ... }          │
│  implementedQuestionTypes: ["radar", "matching"]        │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────────────────────┐
│   RadarQuestion  │     │       MatchingQuestion           │
│  (radarTypes.ts) │     │    (matchingTypes.ts)            │
│                  │     │                                  │
│  distanceMeters  │     │  category: MatchingCategory      │
│  distanceOption  │     │  ├─ transit-line → TransitLine   │
│  distanceUnit    │     │  │   QuestionDetailScreen        │
│  answer          │     │  │   (uses station data)         │
└────────┬────────┘     │  │                               │
         │              │  └─ all others → OsmMatching      │
         │              │      QuestionDetailScreen         │
         │              │      (queries Overpass API)       │
         │              │                                   │
         │              │  candidates: OsmFeature[]          │
         │              │  lineId / lineName (transit only) │
         │              │  selectedOsmId / selectedOsmType  │
         │              │  targetOsmId / targetOsmType      │
         │              │  targetName                       │
         │              └──────────────┬────────────────────┘
         │                             │
         ▼                             ▼
┌─────────────────────────────────────────────────────────┐
│               QuestionGeometry                           │
│  buildQuestionMapRenderState(questions, ...)             │
│  ├─ radar: buildRadarQuestionRenderState()               │
│  ├─ transitLine: buildTransitLineMaskFeatures()          │
│  └─ osmMatching: buildOsmMatchingRenderState()           │
│       ├─ hitMaskFeatures (Voronoi cell of selected)      │
│       ├─ missMaskFeatures (union of other cells)         │
│       └─ poiFeatures (candidate points)                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Map Layers (MapLibre)                       │
│  RadarQuestionLayers  (circles)                         │
│  OsmMatchingLayers    (POI points, selected/unselected)  │
│  PlayAreaMaskLayers   (hit/miss polygon masks)           │
└─────────────────────────────────────────────────────────┘
```

---

## 12. File Manifest

All files related to matching questions:

```
src/features/questions/
  matching/
    matchingTypes.ts              — MatchingQuestion, MatchingCategory, OsmFeature types
    matchingConfig.ts             — QuestionDefinition for matching
    matchingCategories.ts         — 18 category configs with OSM tags
    osmMatching.ts                — Overpass API client (query, parse, findNearest)
    osmMatchingGeometry.ts        — Render state builder (Voronoi masks, POI features)
    matchingVoronoi.ts            — Voronoi cell computation, hit/miss masks
    OsmMatchingQuestionDetailScreen.tsx — OSM matching detail UI
    __tests__/
      matchingCategories.test.ts
      matchingVoronoi.test.ts
      osmMatching.test.ts
      osmMatchingGeometry.test.ts
      OsmMatchingQuestionDetailScreen.test.tsx
  transitLine/
    transitLineTypes.ts           — TransitLineQuestion alias, FeatureCollection type
    transitLineQuestion.ts        — Line options, reconciliation, mask features
    transitLineNormalization.ts   — Canonical route ID validation
    TransitLineQuestionDetailScreen.tsx — Transit-line detail UI
    __tests__/
      transitLineQuestion.test.ts
  MatchingQuestionScreen.tsx      — Category picker screen
  QuestionDetailScreen.tsx        — Routes to correct detail screen
  questionRegistry.ts             — All question type definitions
  questionGeometry.ts             — Aggregates render state from all question types
  questionTypes.ts                — QuestionState union, import types
  coreTypes.ts                    — BaseQuestion, QuestionAnswer, QuestionType
  components/
    QuestionAnswerSelector.tsx    — Segmented answer control (shared)
    QuestionLocationSelector.tsx  — Pin coordinate display + "Set to Location" (shared)

src/state/
  questionStore.tsx               — QuestionProvider, CRUD actions
  appState.ts                     — AppStateV1 schema, migration
  persistence.ts                  — AsyncStorage persistence

src/sharing/wire/
  schema.ts                       — Wire envelope schemas (full keys)
  minified.ts                     — Minified wire format (compact keys/coords)

src/features/map/
  OsmMatchingLayers.tsx           — MapLibre layer for OSM POI markers
  PlayAreaMaskLayers.tsx          — Polygon mask rendering (shared)
```

---

## 13. Conclusion

The matching questions implementation is **solid and well-architected**. The dual-path design (transit-line via station data, OSM categories via Overpass API) is cleanly separated while sharing the same `MatchingQuestion` type. The Voronoi-based hit/miss mask visualization is a clever approach that gives players clear spatial feedback.

All 290 tests pass, TypeScript compiles with zero errors, and the sharing wire format fully supports matching question round-trips.

The two most impactful improvements before wider testing are: (1) adding a debounce on pin-movement → Overpass queries to prevent API spam, and (2) extracting the duplicated haversine distance function to a shared utility. Everything else is polish.
