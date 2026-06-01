# App Caching & Startup Performance Audit

**Date:** 2025-05-31

## Executive Summary

The app has a **multi-layer boundary cache** for play areas (bundled → memory → AsyncStorage → Overpass), but the startup experience is poor because that cache is **overwhelmed by synchronous work** that happens before and during the first render. The perceived "long pause before map stuff loads" is not primarily a network problem — it is a **JavaScript thread blocking problem** caused by:

1. Parsing **465 KB of JSON** at module load time (Tokyo boundary + hiding-zone presets)
2. Running **expensive GeoJSON computations** on 171 KB of Tokyo boundary data during the first React render (bbox, mask building, polygon orientation)
3. **MapLibre native initialization** with no splash screen to mask the delay
4. **Two full map renders** — one with default state, then a second after AsyncStorage restoration completes

Beyond startup, there are significant runtime caching gaps:

- No Photon search result caching
- No tile caching strategy
- Heavy polygon operations (Turf union, polyclip-ts) re-run from scratch on every relevant state change
- App state persistence writes to AsyncStorage on every keystroke (e.g., radar custom distance input)
- No memoization of Voronoi cells for OSM matching questions

This audit catalogs every caching layer, identifies missed opportunities, and ranks recommendations by impact vs. effort.

---

## Current Caching Architecture

### What Is Cached Today

| Data                                      | Location       | Key / Mechanism                                | TTL          | Notes                                                         |
| ----------------------------------------- | -------------- | ---------------------------------------------- | ------------ | ------------------------------------------------------------- |
| Tokyo 23 Wards boundary                   | JS bundle      | `assets/default-zones/tokyo.json`              | N/A          | Imported at compile time; parsed synchronously on module load |
| Osaka boundary                            | JS bundle      | `assets/default-zones/osaka.json`              | N/A          | Loaded into `BUNDLED_BOUNDARIES` map                          |
| Fetched OSM boundaries                    | AsyncStorage   | `play-area-boundary:${relationId}`             | Infinite     | No invalidation; grows unbounded                              |
| Fetched OSM boundaries                    | Memory (`Map`) | `memoryCache`                                  | Session only | Cleared on app restart                                        |
| Current play area                         | AsyncStorage   | `app-state:v1`                                 | Infinite     | Full GeoJSON boundary inline; heavy read/write                |
| Hiding zone preset data                   | JS bundle      | `data/odpt/generated/hiding-zone-presets.json` | N/A          | 294 KB parsed synchronously on module load                    |
| Hiding zone scalar state                  | AsyncStorage   | `app-state:v1`                                 | Infinite     | `selectedPresetIds`, `radiusMeters`, `radiusUnit`             |
| Questions                                 | AsyncStorage   | `app-state:v1`                                 | Infinite     | Full question array including matching candidates             |
| Question settings                         | AsyncStorage   | `app-state:v1`                                 | Infinite     | `isPinLocked`                                                 |
| Derived GeoJSON (routes, stations, zones) | `useMemo`      | `hidingZoneStore.tsx`                          | Per-render   | Recomputed when deps change                                   |
| Question map render state                 | `useMemo`      | `useQuestionMapRenderState()`                  | Per-render   | Recomputed when `questions` changes                           |
| Combined eligibility mask                 | `useMemo`      | `NativeMap.tsx`                                | Per-render   | Recomputed on any question/hiding zone change                 |
| Map style JSON                            | `useMemo`      | `NativeMap.tsx`                                | Per-mount    | Trivial cost                                                  |
| Photon search results                     | **None**       | —                                              | —            | Fresh network request every time                              |
| Map tiles                                 | **None**       | MapLibre default HTTP only                     | —            | No explicit cache configuration                               |
| User location permission                  | **None**       | —                                              | —            | Re-requested on every locate tap                              |

---

## 1. Startup Bottlenecks

### 1.1 Heavy Synchronous JSON Imports at Module Load

These files are `import`ed at the top level and parsed **during bundle evaluation**, before React can create a single component:

| File                                           | Size       | Imported By                                 |
| ---------------------------------------------- | ---------- | ------------------------------------------- |
| `assets/default-zones/tokyo.json`              | **171 KB** | `src/features/map/playArea.ts`              |
| `data/odpt/generated/hiding-zone-presets.json` | **294 KB** | `src/features/hidingZone/hidingZoneData.ts` |

**Impact:** The JS thread blocks for tens to hundreds of milliseconds parsing ~465 KB of JSON before any UI appears.

**Finding:** `tokyo.json` is imported directly, and `calculateBbox(tokyoBoundary)` is called **twice** at module scope:

```ts
export const defaultPlayArea: DefaultPlayArea = {
    bbox: calculateBbox(tokyoBoundary),
    boundary: tokyoBoundary,
    center: calculateCenter(calculateBbox(tokyoBoundary)), // redundant
    // ...
};
```

### 1.2 Synchronous GeoJSON Computation on First Render

**PlayAreaProvider** (`playAreaStore.tsx`)

- Default state calls `calculateBbox(tokyoBoundary)` on the 171 KB Tokyo GeoJSON during initial `useState` evaluation.
- `calculateBbox` recursively traverses every coordinate array in the boundary.

**HidingZoneProvider** (`hidingZoneStore.tsx`)

- Even with zero presets selected, it computes: `suggestedPresetIds`, `selectedPresets`, `selectedRoutes`, `selectedStations`, `routeFeatures`, `stationFeatures`, `zoneFeatures`.
- `suggestedPresetIds` iterates over the full 294 KB preset dataset and runs `bboxIntersects` against the Tokyo bbox.

**NativeMap** (`NativeMap.tsx`)

- `buildPlayAreaMask(playArea.boundary)` extracts exterior rings from 171 KB and runs ring area calculations.
- `buildCombinedEligibilityMask(...)` is called on first render even with no hiding zones or questions — it still calls `getPolygons` on the 171 KB boundary.
- `useQuestionMapRenderState()` runs `buildQuestionMapRenderState` for all question families even when `questions` is empty.

### 1.3 No Lazy Loading

A grep for `lazy`, `Suspense`, or dynamic `import()` returned **zero results**. Every feature screen is eagerly imported:

- `MainDrawer` imports all screens at the top level (`HidingZoneScreen`, `PlayAreaScreen`, `AddQuestionScreen`, `MatchingQuestionScreen`, etc.)
- All heavy geometry libraries (`@turf/circle`, `@turf/union`, `@turf/voronoi`, `polyclip-ts`, `osmtogeojson`) are statically imported even if unused on the current route.

### 1.4 Persistence Restoration Triggers a Second Render

`AppStatePersistenceCoordinator` renders `children` (including `MapAppScreen` and `NativeMap`) **immediately** while `loadPersistedAppState()` runs asynchronously in `useEffect`.

**Sequence:**

1. First paint: default state (Tokyo, empty questions, no restored settings)
2. AsyncStorage read completes
3. Second paint: restored state imported, map re-fits, layers rebuild → visible "jump"
4. If there is a persisted non-Tokyo play area, `loadPlayAreaByRelationId` is called but the boundary cache is **cold** (session-only memory cache was lost on restart)

### 1.5 No Splash Screen

The app has no `expo-splash-screen` configuration. Users see a blank native window while all of the above synchronous work executes.

---

## 2. Play Area & OSM Boundary Caching

### 2.1 Current Architecture

`loadPlayAreaByRelationId` implements a sensible cascade:

```
1. Bundled default (Tokyo 19631009, Osaka 358674)
2. In-memory Map cache
3. AsyncStorage persisted cache
4. Overpass API fetch
```

After fetch, results are stored in both memory cache and AsyncStorage.

### 2.2 Gaps

**A. No Photon search caching**
`searchPlayAreas` in `playAreaSearch.ts` hits the network every time with zero caching. Every keystroke debounce (350ms) triggers a fresh request. No in-memory or AsyncStorage cache for queries or results.

**B. AsyncStorage cache grows unbounded**
Every unique relation ID ever fetched is stored forever under `play-area-boundary:${id}` with no TTL, versioning, or eviction.

**C. No stale-while-revalidate**
If a boundary exists in AsyncStorage, it is returned immediately with no background refresh. OSM data can change, but the app will never know.

**D. Boundary cache is cold on startup**
The memory cache is session-only. If the app process restarts, a previously fetched relation will hit Overpass again even though its boundary may still be valid in AsyncStorage. The boundary cache is **not warmed from AsyncStorage** on startup — `loadPersistedAppState` restores the current play area into app-state, but does not seed the `play-area-boundary:` cache keys.

**E. Full boundary geometry in monolithic app-state**
`app-state:v1` includes the entire GeoJSON `boundary` for the current play area. For Tokyo, this is ~171 KB of JSON embedded in every read/write. The boundary could be stored under its own cache key and referenced by ID.

---

## 3. Hiding Zone Derived State

### 3.1 Current Architecture

`HidingZoneProvider` uses `useMemo` for all derived GeoJSON:

- `suggestedPresetIds` — bbox intersection with play area
- `selectedPresets`, `selectedRoutes`, `selectedStations` — filter / dedupe / merge
- `routeFeatures`, `stationFeatures` — flatMap into GeoJSON
- `zoneFeatures` — Turf circle + Turf union

### 3.2 Gaps

**A. `buildHidingZoneFeatureCollection` is the most expensive operation**
For each station, it calls `@turf/circle([lon, lat], radiusMeters/1000, { steps: 48, units: "kilometers" })` (creates a 48-sided polygon), then unions all circles via `@turf/union`.

For Tokyo Metro + Toei (~300+ stations), this is a heavy CPU operation on the JS thread. It re-runs entirely whenever `radiusMeters` changes (e.g., user typing in the radius input).

**B. No cache for zone polygon by `(presetComboKey, radiusMeters)`**
The union polygon depends only on the set of selected presets and radius. If a user toggles preset A off then back on, or changes radius from 600→700→600, the polygon is recalculated from scratch.

**C. `getSelectedStations` rebuilds on every preset toggle**
Iterates all stations, builds a `Map` for deduplication by `mergeKey`, merges `routeIds`/`routeColors`/`sourceStationIds` with `Set` + `sort()`. This could be cached by sorted `selectedPresetIds`.

**D. Transit line questions duplicate the same work**
`buildTransitLineMaskFeatures` reuses `buildHidingZoneFeatureCollection()` but filtered to stations on a single line — the same Turf circle+union logic runs again. If the same line is selected in multiple questions, it's recomputed each time.

---

## 4. Map Initialization & Rendering

### 4.1 Current Architecture

- `NativeMap` is a single component wrapping `@maplibre/maplibre-react-native`
- Style JSON is built once per mount via `useMemo`
- Camera fits play area on `onDidFinishLoadingMap`
- Layer ordering follows MapLibre RN best practices

### 4.2 Gaps

**A. No explicit tile caching**
The OSM raster style points to `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. There is no `cacheSize` configuration, no offline region management, no MBTiles, no custom `NSURLCache` or OkHttp cache configuration. The app relies entirely on MapLibre RN's default HTTP cache behavior.

**B. `buildCombinedEligibilityMask` recomputes from scratch on every change**

```ts
const combinedInsideMask = useMemo(() => {
    return buildCombinedEligibilityMask(
        playArea.boundary,
        [zoneFeatures, ...radar.hitMaskFeatures, ...transitLine.hitMaskFeatures, ...osmMatching.hitMaskFeatures],
        [radar.missMaskFeatures, transitLine.missMaskFeatures, osmMatching.missMaskFeatures]
    );
}, [playArea.boundary, zoneFeatures, ...all mask features]);
```

Uses `polyclip-ts` (polygon clipping library) for boolean intersections and differences. Recomputes whenever **any** question or hiding zone changes, even if the change is unrelated to most constraints.

**C. Voronoi computation for OSM matching is unmemoized**
`computeVoronoiCells` in `matchingVoronoi.ts` runs on every render for active matching questions:

```ts
const cells = voronoi(featureCollection(points), { bbox });
```

For many candidates, this is expensive and blocks the JS thread.

**D. `ShapeSource` re-creation on every GeoJSON change**
Every time a GeoJSON object changes reference, MapLibre RN re-parses and uploads the entire geometry to the native layer. There is no incremental GeoJSON diffing.

**E. User location permission is re-requested every time**
`requestUserCoordinate` always calls `requestForegroundPermissionsAsync()` followed by `getCurrentPositionAsync()`. There is no caching of permission state or last known position.

---

## 5. Question State Management

### 5.1 Current Architecture

- `QuestionProvider` uses split contexts (State / Actions / Derived) to reduce re-renders
- `useQuestionMapRenderState()` memoizes the full `QuestionMapRenderState`
- Action callbacks are wrapped in `useCallback`

### 5.2 Gaps

**A. `questions` array identity changes on every update**
`updateQuestion` uses `setQuestions(current.map(...))`, creating a new array reference on every question edit. Because `questions` is in `QuestionStateContext`'s `stateValue`, any consumer of `useQuestionState()` re-renders.

**Affected components:**

- `NativeMap` — subscribes to `useQuestionState()` for `isPinLocked`, but re-renders on every radar distance keystroke because the full state object changes
- `AppStatePersistenceCoordinator` — re-renders on every state change, triggering serialization + AsyncStorage write

**B. App state persistence writes on every keystroke**
There is **no debounce/throttle** in `AppStatePersistenceCoordinator`. Typing in the custom radar distance field triggers `updateRadarDistanceValue` on every keystroke, which updates `questions`, which re-renders the coordinator, which serializes the full app state to JSON and writes to AsyncStorage **on every keystroke**.

**C. `activeQuestionId` is not persisted**
Lost on app restart. User returns to question list, not the last edited question.

**D. `buildRadarQuestionRenderState` rebuilds all radar questions on every call**
Currently it filters and maps all radar questions into GeoJSON on every call. For large question lists, individual question feature collections could be cached and combined.

**E. `NativeMap` subscribes to more state than it needs**
`NativeMap` reads `useQuestionState()` to get `isPinLocked`, but receives the full state object including `questions`. Any question edit causes `NativeMap` to re-render and recompute all masks.

---

## 6. App Persistence Layer

### 6.1 Current Architecture

- Single AsyncStorage key: `app-state:v1`
- Auto-saves on every relevant state change via `useEffect`
- On startup: reads `app-state:v1`, validates with Zod, imports into providers
- Migration support via Zod transforms (legacy `type: "radius"` → `type: "radar"`)

### 6.2 Gaps

**A. Monolithic snapshot**
All state (play area boundary, hiding zones, questions, metadata) is serialized to a single JSON blob. This means:

- Every write serializes the full state even if only one field changed
- Tokyo's 171 KB boundary is included in every snapshot
- AsyncStorage write is blocking on the JS thread for large states

**B. No debounced writes**
Writes happen synchronously in a `useEffect` on every dependency change.

**C. No cache metadata**
No timestamps on cached boundaries or app-state snapshots. No way to implement TTL or stale-while-revalidate.

---

## Recommendations

### Quick Wins (Low Effort, High Impact)

| #   | Recommendation                                                                                                | Impact   | Effort | Files                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------- | -------- | ------ | --------------------------------------------------------------------- |
| 1   | **Debounce app-state persistence writes** (300–500 ms)                                                        | High     | Low    | `src/state/AppStateProviders.tsx`                                     |
| 2   | **Pre-compute Tokyo bbox once** — fix double `calculateBbox` call                                             | Medium   | Low    | `src/features/map/playArea.ts`                                        |
| 3   | **Cache user location permission** — check existing permission before requesting                              | Medium   | Low    | `src/shared/location.ts`                                              |
| 4   | **Add Photon search in-memory cache** — cache last N queries in a `Map`                                       | Medium   | Low    | `src/features/playArea/playAreaSearch.ts`                             |
| 5   | **Memoize Voronoi cells** per-matching-question by candidates array + playAreaBbox                            | High     | Low    | `src/features/questions/matching/matchingVoronoi.ts`                  |
| 6   | **Cache `buildHidingZoneFeatureCollection` by `(presetComboKey, radiusMeters)`**                              | High     | Low    | `src/features/hidingZone/hidingZone.ts`                               |
| 7   | **Add `activeQuestionId` to persisted state**                                                                 | Low (UX) | Low    | `src/state/persistence.ts`, `src/features/questions/questionTypes.ts` |
| 8   | **Warm boundary cache from AsyncStorage on startup** — iterate `play-area-boundary:*` keys into `memoryCache` | Medium   | Low    | `src/features/map/playAreaBoundary.ts`                                |

### Medium Effort, High Impact

| #   | Recommendation                                                                                                                                      | Impact | Effort | Files                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------ |
| 9   | **Add splash screen + restoration loading gate** — keep `expo-splash-screen` visible until `isRestored` and `onDidFinishLoadingMap`                 | High   | Medium | `app/_layout.tsx`, `src/state/AppStateProviders.tsx`                           |
| 10  | **Lazy-load hiding-zone preset JSON** — load `hiding-zone-presets.json` asynchronously instead of top-level import                                  | High   | Medium | `src/features/hidingZone/hidingZoneData.ts`, `src/state/AppStateProviders.tsx` |
| 11  | **Lazy-load sheet route screens** with `React.lazy` + `Suspense`                                                                                    | Medium | Medium | `src/features/sheet/MainDrawer.tsx`                                            |
| 12  | **Split `app-state:v1` into separate AsyncStorage keys** — `app-state:questions`, `app-state:hidingZones`, `play-area-boundary:${id}`               | High   | Medium | `src/state/persistence.ts`, `src/state/AppStateProviders.tsx`                  |
| 13  | **Cache mask contributions independently** — compute hiding-zone mask, radar masks, transit-line masks, OSM matching masks separately, then compose | High   | Medium | `src/features/map/NativeMap.tsx`, `src/features/map/maskBuilder.ts`            |
| 14  | **Granular question state subscription** — create `useIsPinLocked()` hook so `NativeMap` doesn't re-render on every question edit                   | High   | Medium | `src/features/questions/QuestionProvider.tsx`                                  |
| 15  | **Add cache metadata (timestamp) to AsyncStorage boundary entries** — enables future TTL-based invalidation                                         | Medium | Medium | `src/features/map/playAreaBoundary.ts`                                         |

### Follow-up Review (2026-06-01)

| #   | Disposition                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Strengthened.** App-state writes remain debounced and now flush when the app backgrounds or the provider unmounts.                                                                                                      |
| 2   | **Complete.** Tokyo bbox is calculated once and reused for the center.                                                                                                                                                    |
| 3   | **Complete.** Location permission is checked before requesting it again.                                                                                                                                                  |
| 4   | **Complete.** Photon queries use a bounded in-memory LRU cache with normalized keys.                                                                                                                                      |
| 5   | **Complete.** Voronoi cells use a bounded LRU cache keyed by candidates and play-area bbox.                                                                                                                               |
| 6   | **Strengthened.** Hiding-zone geometry caching now includes station coordinates as well as IDs and radius.                                                                                                                |
| 7   | **Fixed.** `activeQuestionId` was serialized and restored, but changes did not schedule a write. It is now a persistence dependency.                                                                                      |
| 8   | **Strengthened.** Boundary warming is covered by tests, and corrupted entries are ignored and replaced on the next fetch.                                                                                                 |
| 9   | **Strengthened.** The splash waits for state restoration and MapLibre's first loaded frame, with a timeout fallback.                                                                                                      |
| 10  | **Complete.** Hiding-zone presets load asynchronously; load failures leave the app usable without suggestions.                                                                                                            |
| 11  | **Deferred intentionally.** After preset JSON lazy loading, the remaining route modules are small. Add route-level `Suspense` only if profiling shows a meaningful route-load bottleneck.                                 |
| 12  | **Implemented.** Local persistence now uses separate versioned slices and stores only a play-area relation reference; boundary GeoJSON lives in the boundary cache. The share/wire `AppStateV1` format remains unchanged. |
| 13  | **Strengthened.** Combined-mask caching now uses exact feature identity instead of collision-prone coordinate sampling, and polygon extraction is cached per unchanged feature.                                           |
| 14  | **Complete.** `NativeMap` uses the granular `useIsPinLocked()` subscription.                                                                                                                                              |
| 15  | **Strengthened.** Boundary envelopes include `cachedAt`; malformed cache entries are removed instead of breaking play-area loading.                                                                                       |

### Higher Effort, High Impact

| #   | Recommendation                                                                                                                   | Impact | Effort | Files                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ------------------------------------------------------------ |
| 16  | **Configure MapLibre native tile caching** — set cache size limits, consider offline packs for current play area bbox            | High   | High   | `src/features/map/NativeMap.tsx`, `app.json`                 |
| 17  | **Normalize questions array to `{ byId, allIds }`** — prevents entire-array reference changes on single-question edits           | High   | High   | `src/features/questions/QuestionProvider.tsx`, all consumers |
| 18  | **Incremental GeoJSON diffing for ShapeSource** — only update changed features instead of full replacement                       | High   | High   | `src/features/map/NativeMap.tsx`                             |
| 19  | **Pre-compute and bundle Tokyo bbox/center/mask** — store pre-calculated values in `tokyo.json` or a companion file              | Medium | High   | `assets/default-zones/tokyo.json`, build scripts             |
| 20  | **Implement stale-while-revalidate for boundaries** — return AsyncStorage cache immediately, refresh from Overpass in background | Medium | High   | `src/features/map/playAreaBoundary.ts`                       |

### Higher-Effort Follow-up (2026-06-01)

| #   | Disposition                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | **Complete.** The root layout configures a bounded `100 MiB` native MapLibre ambient tile cache before rendering the route stack. Offline packs are intentionally excluded while the raster source is `tile.openstreetmap.org`. |

### Architectural Direction

The highest-leverage changes are:

1. **Startup:** Add a loading gate + splash screen so the first user-visible frame happens after restoration is complete. Async-load the 294 KB preset JSON.
2. **Derived state caching:** Cache `buildHidingZoneFeatureCollection` and `buildCombinedEligibilityMask` contributions by their actual inputs. The union of 300+ Turf circles is the single most expensive computation in the app.
3. **Persistence:** Debounce writes and split the monolithic snapshot into smaller, independently written keys.
4. **Subscriptions:** Stop over-subscribing `NativeMap` to the full `questions` array — it only needs `isPinLocked` and derived map features.
5. **OSM data caching:** The user noted OSM data changes infrequently. Boundaries cached in AsyncStorage could safely live for months. Adding cache metadata (timestamp) and a TTL of ~30 days would prevent unbounded growth while keeping cached data fresh enough.

---

## Appendix: Performance Trigger Matrix

| User Action                 | Recomputed                                                                       | Cost                                                   |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| App startup                 | Parse 465 KB JSON, bbox on 171 KB boundary, mask build, all derived state        | **Critical**                                           |
| Persistence restore         | Second full render with restored state, map re-fit                               | **High**                                               |
| Change play area            | `playAreaMask`, `fitPlayArea`, hiding zone suggestions, `combinedInsideMask`     | Medium                                                 |
| Toggle hiding zone preset   | `zoneFeatures`, `stationFeatures`, `routeFeatures`, `combinedInsideMask`         | **High** (Turf union + polyclip)                       |
| Change hiding zone radius   | `zoneFeatures`, `combinedInsideMask`                                             | **High** (Turf union × every keystroke)                |
| Add/edit radar question     | `radarGeometry`, `combinedInsideMask`                                            | Medium                                                 |
| Answer radar question       | `radarGeometry`, `combinedInsideMask`                                            | Medium                                                 |
| Add/edit matching question  | `osmMatchingGeometry` (Voronoi), `combinedInsideMask`                            | **High**                                               |
| OSM matching candidate load | `osmMatchingGeometry`, `combinedInsideMask`                                      | **High**                                               |
| Type custom radar distance  | `questions` array, `AppStatePersistenceCoordinator` write, `NativeMap` re-render | **High** (AsyncStorage + full recompute per keystroke) |
| Tap locate me               | `requestForegroundPermissionsAsync` + `getCurrentPositionAsync`                  | Low (but unnecessary if permission already granted)    |
