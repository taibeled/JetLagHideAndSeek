# Codebase Refactoring Plan

> Scope: everything outside `NativeMap.tsx` (covered in `docs/native-map-refactor.md`).

---

## Executive Summary

The codebase is well-structured for its milestone — thin routing shell, focused
state stores, feature-based directories, and strong map/state test coverage.
The main quality risks are:

1. **Two god files:** `MainDrawer.tsx` (533 lines) and
   `RadarQuestionDetailScreen.tsx` (449 lines)
2. **Duplicated logic:** UI row patterns and legacy-radius normalization appear
   in multiple places
3. **Tight cross-feature coupling:** radar detail screen imports from map,
   hidingZone, and sheet; NativeMap imports question-store updaters directly
4. **Test imbalance:** a 1,447-line integration mega-test
   (`MapAppScreen.test.tsx`) vs. zero unit tests for most screen components
5. **Render-state living in stores:** `hidingZoneStore` and `questionStore`
   derive map GeoJSON, blurring the state/view boundary

---

## 1. Shared Primitives (High Priority, Low Risk)

### 1a. `src/components/SheetListRow.tsx`

**Problem:** The pressable row pattern (card, title, description, chevron,
`actionPressed: { opacity: 0.72 }`) is reinvented in MainDrawer, Settings,
PlayArea, Questions, HidingZone, and AddQuestion — at least 10 instances.

**Action:**

- Extract `SheetListRow` with props: `title`, `description?`, `onPress`,
  `trailing?` (for chevron/icon), `destructive?`
- Migrate one screen at a time (Settings is the safest starting point)

---

## 2. `MainDrawer.tsx` Decomposition (High Priority)

### Problem

533 lines owning:

- Route → component switch (`renderRouteContent`)
- Reanimated slide transitions
- BackHandler + edge-swipe gesture
- `DrawerAction` / `BackButton` primitives
- Menu content (all rows, icons, titles)
- Route-specific container wrappers

Every new sheet route requires editing this file in 3+ places.

### Proposed Structure

```
src/features/sheet/
├── MainDrawer.tsx          (~80 lines, thin orchestrator)
├── routeRegistry.ts        (route → { component, snap, back, title })
├── useSheetTransition.ts   (Reanimated slide + back-handler)
├── DrawerMenu.tsx          (main menu content + navigation rows)
├── DrawerHeader.tsx        (back button + route-specific header chrome)
└── sheetRoutes.ts          (existing; becomes the ID enum only)
```

### Migration Steps

1. Extract `routeRegistry.ts` — a declarative table of `{ route, component,
backTarget, snapIndex, headerAccessory? }`. `MainDrawer` becomes a lookup
   instead of a switch.
2. Extract `useSheetTransition` — owns `Animated.Value`, `runTransition`,
   BackHandler listener, edge-swipe pan gesture.
3. Extract `DrawerMenu` — the main-route list (`SettingsRow`, `QuestionsRow`,
   etc.) with shared row component.
4. Extract `DrawerHeader` — back button + per-route title/accessories (e.g.
   `QuestionPinLockButton`).
5. `MainDrawer` becomes a coordinator: reads route from nav state, looks up
   registry, renders header + content + transition wrapper.

---

## 3. `RadarQuestionDetailScreen.tsx` Decomposition (Medium Priority)

### Problem

449 lines combining:

- Distance option picker (preset grid)
- Custom distance input with draft state
- Answer selector (hit/miss/unknown)
- Nearest-station info box
- Location-set button
- Full StyleSheet (~150 lines)
- Imports from `map/`, `hidingZone/`, and `sheet/` (tight coupling)

### Proposed Structure

```
src/features/questions/radar/
├── RadarQuestionDetailScreen.tsx   (~100 lines, composes below)
├── RadarDistancePicker.tsx         (preset grid + "other" custom input)
├── RadarLocationInfo.tsx           (nearest station, center coordinate)
├── radarGeometry.ts                (unchanged)
├── radarTypes.ts                   (unchanged)
├── radarConfig.ts                  (unchanged)
└── useRadarDistanceDraftInput.ts   (unchanged)
```

### Coupling Reduction

- `RadarLocationInfo` receives `stations` and `center` as props instead of
  importing `useHidingZone` directly.
- `SHEET_SNAP_INDEX` dependency can be replaced by a context value or prop —
  the detail screen shouldn't know about sheet geometry.
- `requestUserCoordinate` (from `map/useUserLocation`) should be injected via
  a callback prop from the parent screen.

---

## 4. State Layer Cleanup (Medium Priority)

### 4a. Extract render-state derivation from stores

**Problem:** `hidingZoneStore` (18 context fields) and `questionStore` both
derive map GeoJSON via `useMemo` chains. Consumers that only need settings
re-render when geometry changes.

**Action:**

- Extract `useHidingZoneMapLayers(store)` and `useQuestionMapLayers(store)` as
  separate hooks (or selectors) that derive GeoJSON from store state.
- The stores expose raw state; `NativeMap` calls the render hooks.
- Reduces context surface and clarifies the
  `state → derived render → map layers` pipeline from AGENTS.md.

### 4b. Consolidate legacy-radius normalization

**Problem:** `type: "radius"` → `type: "radar"` migration exists in both
`appState.ts` (Zod transform) and `questionStore.tsx`
(`normalizeQuestionState`). Two code paths must stay in sync.

**Action:**

- Move the canonical normalizer to `questions/radar/radarTypes.ts`
  (pure function, no store dependency).
- Both `appState.ts` and `questionStore.tsx` call the shared normalizer.
- Single unit test covers the migration.

### 4c. Extract radar helpers from `questionStore.tsx`

**Problem:** 8 radar-specific pure functions (`updateRadarQuestionCenter`,
`updateRadarAnswer`, `getRadarDistanceDisplayValue`, etc.) live in the generic
question store file (363 lines total).

**Action:**

- Move them to `questions/radar/radarUpdaters.ts`.
- `questionStore` re-exports for backwards compat or callers update imports.
- Follows AGENTS.md guidance: "keep type-specific editing logic in focused
  detail components/hooks."

---

## 5. Test Architecture (Medium Priority)

### 5a. Split `MapAppScreen.test.tsx`

**Problem:** 1,447 lines mixing map helpers, geometry math, navigation
workflows, radar question flows, hiding zone flows, and play area flows.
Any change to any feature risks merge conflicts.

**Proposed split:**
| New file | Covers |
|----------|--------|
| `MapAppScreen.navigation.test.tsx` | Sheet nav, transitions, edge-swipe |
| `MapAppScreen.radarQuestions.test.tsx` | Radar create/delete, pin lock/drag, distance |
| `MapAppScreen.hidingZones.test.tsx` | Presets, radius, GeoJSON masks |
| `MapAppScreen.playArea.test.tsx` | Osaka, relation ID, Overpass errors |
| `__helpers__/mapTestUtils.ts` | Shared `getMapShapeSource`, `projectedRingArea`, geometry helpers |

All imports from a shared helpers file; each suite renders `MapAppScreen` in
the same wrapper.

### 5b. Add unit tests for untested modules

Priority targets (descending by risk × complexity):

| Module                                | Lines | Why                                                 |
| ------------------------------------- | ----- | --------------------------------------------------- |
| `radar/radarGeometry.ts`              | 124   | Pure geometry; easy to test, high correctness value |
| `radar/useRadarDistanceDraftInput.ts` | 145   | Complex draft/sync; `renderHook` testable           |
| `sheet/sheetNav.ts`                   | 35    | Navigation logic used by MainDrawer                 |
| `sharing/wire/schema.ts`              | 102   | Zod schema validation; data integrity boundary      |
| `sharing/import/applyImport.ts`       | 65    | Import correctness                                  |

### 5c. Jest config cleanup

- Remove `modulePaths: ["<rootDir>/../node_modules"]` — likely legacy from
  `mobile_v2` subfolder layout.
- Verify `tsconfig.json` `../node_modules/@types` path is still needed.

---

## 6. Minor Hygiene (Low Priority)

### 6a. Shared `requestAnimationFrame` pattern

The `rafRef` + cancel + guard pattern in NativeMap's pin drag is a reusable
throttle utility. Extract `useRafThrottle(callback)` if other gestures adopt
the same pattern.

### 6b. `playAreaBoundary.ts` location

Lives in `map/` while `PlayAreaScreen` lives in `playArea/`. Consider moving
boundary loading to `playArea/playAreaBoundary.ts` and re-exporting from `map/`
for camera-fit callers. Or leave it — the current split (I/O in map, UI in
playArea) is defensible.

### 6c. Theme expansion

`colors.ts` is 15 lines — no typography, spacing, or shadows. The same shadow
style appears in 5+ files (`elevation: 5, shadowColor, shadowOffset, ...`).
Consider adding `theme/shadows.ts` and `theme/spacing.ts` as the project grows.

### 6d. `+not-found.tsx` inline styles

Only route with an inline `StyleSheet`. Minor, but could use `colors` tokens
for the background and link colors for consistency.

---

## Execution Order

Phases ordered by value/risk ratio:

| Phase | Items                                                                | Estimated scope               |
| ----- | -------------------------------------------------------------------- | ----------------------------- |
| **1** | 1a (distanceUnits), 1b (UnitSegmentedControl), 4b (radius normalize) | ~200 lines moved/consolidated |
| **2** | 4c (radar helpers out of store), 1c (SheetListRow)                   | ~150 lines extracted          |
| **3** | 2 (MainDrawer decomp)                                                | ~450 lines reorganized        |
| **4** | 3 (RadarQuestionDetail decomp), 4a (render-state hooks)              | ~400 lines reorganized        |
| **5** | 5a–5c (test split + new unit tests + config)                         | Test infra; no prod changes   |
| **6** | 6a–6d (hygiene)                                                      | Low-priority polish           |

Each phase keeps tests green and ships independently.

---

## Non-Goals

- Rewriting the state layer to Zustand/Jotai — React Context is fine at this
  scale.
- Introducing a navigation library for the bottom sheet — the sheet-nav pattern
  is custom but adequate.
- Adding tests for stub question configs (matching, measuring, etc.) — they're
  placeholders until those question types are implemented.
- Rearchitecting the persistence/wire format — v1 schema is stable and
  well-tested.
