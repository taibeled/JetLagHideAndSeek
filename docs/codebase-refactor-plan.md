# Codebase Refactoring Plan

**Last updated:** 2026-05-28  
**Scope:** Remaining structural cleanup outside the completed NativeMap split.

## Current Risks

1. `MainDrawer.tsx` still combines sheet transition mechanics with route
   rendering.
2. `MapAppScreen.test.tsx` is still a large integration suite that covers too
   many feature areas.
3. Shared UI primitives exist, but many screens still hand-roll the same
   Pressable row/header/card patterns.
4. Store contexts expose mutable setup state and derived map render data
   together.
5. Type workarounds for native libraries are not fully isolated.

## Completed From Earlier Plans

- `SheetListRow` was added under `src/components/SheetListRow.tsx`.
- `UnitSegmentedControl` was added under
  `src/components/UnitSegmentedControl.tsx`.
- `NativeMap.tsx` was decomposed into focused map helpers/layer components.
- `eventCoordinate.ts`, `usePinDrag.ts`, and map layer components now have
  focused coverage.
- Matching/transit-line questions are now implemented enough to participate in
  question state and map mask rendering.

## 1. Shared Sheet UI Primitives

### Problem

The row pattern is still duplicated across play-area search/presets,
hiding-zone presets, drawer actions, question rows, and some action buttons.
Headers repeat the same eyebrow/title/detail typography in several screens.

### Actions

- Extend `SheetListRow` with:
    - `selected?: boolean`
    - `trailingLabel?: string`
    - compact/default density options if needed
- Add `SheetHeader` with `eyebrow`, `title`, and optional `detail`.
- Migrate screens incrementally:
    1. `PlayAreaScreen`
    2. `HidingZoneScreen`
    3. `QuestionsScreen`
    4. `MainDrawer` / `AddQuestionScreen`

## 2. `MainDrawer.tsx` Decomposition

### Problem

`MainDrawer` owns all of these concerns:

- Route transition state and cleanup timers
- Reanimated leaving/entering styles
- Hardware-back handling
- Edge-swipe gesture
- Route content switch
- Back-button/header chrome
- Main menu rows

### Target Shape

```text
src/features/sheet/
├── MainDrawer.tsx              # thin orchestrator
├── routeRegistry.tsx           # route -> component/back/accessory metadata
├── useSheetRouteTransition.ts  # transition state, timers, animated styles
├── DrawerMenu.tsx              # main route content
└── DrawerHeader.tsx            # back button + route accessory chrome
```

### Migration Steps

1. Extract a route registry from `renderRouteContent`.
2. Extract `useSheetRouteTransition` and keep current behavior identical.
3. Move main-menu rows into `DrawerMenu`.
4. Move back/header chrome into `DrawerHeader`.
5. Add tests for navigation direction, cleanup timer behavior, and back target
   selection.

## 3. State and Render-State Cleanup

### Problem

`HidingZoneProvider` and `QuestionProvider` expose both mutable state and map
render artifacts. This keeps current consumers simple but makes every provider
consumer sensitive to geometry changes.

### Actions

- Keep providers focused on mutable app/setup state.
- Extract selector hooks:
    - `useHidingZoneMapRenderState`
    - `useQuestionMapRenderState`
- Move cross-question map render types out of `radarTypes.ts`.
- Keep `NativeMap` as the main consumer of derived map render state.

## 4. Question Store Cleanup

### Problem

Radar-specific pure helpers still live in the generic `questionStore.tsx`.

### Actions

- Move radar mutators/display helpers to
  `src/features/questions/radar/radarUpdaters.ts`.
- Re-export temporarily from `questionStore.tsx` if that makes migration
  smaller.
- Consolidate legacy `type: "radius"` normalization so restore/import paths use
  one canonical normalizer.

## 5. Type Safety Cleanup

### Problem

`ComponentType<any>` casts are practical, but currently spread across map and
sheet code.

### Actions

- Finish the MapLibre facade in `mapLibrePrimitives.ts`.
- Add a bottom-sheet facade for the small app-used prop surface.
- Add `eslint-plugin-react-hooks`.
- Re-enable `@typescript-eslint/no-explicit-any` as a warning once native shim
  files and tests are isolated.

## 6. Test Architecture

### Split `MapAppScreen.test.tsx`

Proposed files:

| New file                               | Covers                                       |
| -------------------------------------- | -------------------------------------------- |
| `MapAppScreen.navigation.test.tsx`     | Sheet nav, transitions, edge-swipe           |
| `MapAppScreen.radarQuestions.test.tsx` | Radar create/delete, pin lock/drag, distance |
| `MapAppScreen.hidingZones.test.tsx`    | Presets, radius, GeoJSON masks               |
| `MapAppScreen.playArea.test.tsx`       | Osaka, relation ID, Overpass errors          |
| `helpers/mapAppScreenTestUtils.tsx`    | Shared render and map-source helpers         |

### Add Focused Component/Hook Tests

- `PlayAreaScreen` debounce and stale-response handling.
- `MainDrawer` transition hook after extraction.
- Radar distance picker/draft-input edge cases.
- Import/apply flows around partial setup imports.

## 7. Persistence and Performance

### Problem

The app persists a full snapshot after restore whenever app state changes. This
can include large play-area boundary GeoJSON and can fire during high-frequency
edits.

### Actions

- Debounce persistence writes.
- Consider persisting reconstructable play areas by relation/cache key.
- Keep inline boundary persistence only for imported/custom boundaries that
  cannot be reconstructed locally.

## 8. Minor Hygiene

- Move hardcoded semantic colors into `src/theme/colors.ts`.
- Consider `useWindowDimensions()` in sheet transition code instead of a module
  level `Dimensions.get("window").width`.
- Add a top-level error boundary before more native-map/question complexity is
  added.
- Keep historical docs clearly labeled so they do not read as active plans.

## Suggested Execution Order

| Phase | Work                                                     |
| ----- | -------------------------------------------------------- |
| 1     | Fix play-area stale search responses and add tests       |
| 2     | Finish MapLibre/bottom-sheet typed facades               |
| 3     | Extract `useSheetRouteTransition` and route registry     |
| 4     | Split `MapAppScreen.test.tsx`                            |
| 5     | Migrate repeated rows/headers to shared sheet primitives |
| 6     | Extract render-state selectors and radar updaters        |
| 7     | Debounce/optimize persistence writes                     |

## Non-Goals

- Replacing React Context with a state library.
- Introducing a full navigation library inside the bottom sheet.
- Changing the wire format without a versioned migration.
- Changing native dependency setup as part of cleanup-only work.
