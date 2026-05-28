# Code Quality Audit

**Last updated:** 2026-05-28  
**Scope:** Expo SDK 54 React Native app (`src/`, `app/`, sharing wire format, tests, tooling)  
**Purpose:** Living quality/audit snapshot. Historical refactor plans should be
trimmed as work lands so this file stays action-oriented.

## Executive Summary

The codebase is in **good health** for the current milestone. The largest
improvement since the previous audit is that `NativeMap.tsx` is no longer a
685-line god component: map event parsing, pin drag, controls, masks, play-area
boundary, hiding-zone layers, radar layers, and active-pin rendering now live in
focused modules.

The remaining quality risks are more targeted:

- `MapAppScreen.test.tsx` is still a large integration mega-test.
- `MainDrawer.tsx` still mixes sheet navigation transitions with route
  rendering.
- MapLibre / bottom-sheet type shims still rely on `ComponentType<any>`.
- A few UI and state patterns can be made simpler now that the feature surface
  has grown.

**Overall grade: B+**. The architecture is pointed the right way; the next
quality pass should remove stale workarounds and split the remaining hotspots.

## Strengths

- `MapAppScreen` remains a thin coordinator for map, FAB, and bottom sheet.
- Map rendering now follows the intended `state -> derived render state ->
NativeMap layers` shape better than the previous audit described.
- Pure map/domain helpers (`camera.ts`, `maskBuilder.ts`, `hidingZone.ts`,
  `radarGeometry.ts`, `playAreaBoundary.ts`) remain independently tested.
- Question extensibility has a registry/config pattern, with implemented radar
  and matching question behavior separated by feature.
- Sharing/import/export code is schema-driven and well-tested.
- Root providers, safe-area handling, bottom-sheet snap behavior, and centralized
  Jest mocks are healthy.

## Completed Since Previous Audit

- `NativeMap.tsx` was decomposed from roughly 685 lines to a coordinator-sized
  component.
- Map event coordinate parsing moved to `src/features/map/eventCoordinate.ts`.
- Pin drag moved to `src/features/map/usePinDrag.ts` with focused tests.
- Map layer groups moved into `PlayAreaMaskLayers`, `HidingZoneLayers`,
  `RadarQuestionLayers`, `PlayAreaBoundaryLayer`, and `ActivePinLayer`.
- `MapControls` was extracted.
- `UnitSegmentedControl` was extracted and shared by hiding-zone radius and
  radar custom distance controls.
- `SheetListRow` exists and is already used by some sheet/settings surfaces.
- Matching/transit-line question support has been added to the question/render
  pipeline.

## Current Findings

### P1: Play-area search can commit stale responses

`PlayAreaScreen` debounces text input, but once a Photon request starts, a
slower old response can still overwrite newer search results.

**Recommendation:** Add `AbortController` support to `searchPlayAreas`, or keep
a request sequence ref in `PlayAreaScreen` and only commit the latest response.
Add a component test for rapid query changes.

### P1: `MapAppScreen.test.tsx` is still too broad

The file is about 1,400 lines and mixes sheet navigation, map source assertions,
geometry checks, persistence, play-area loading, hiding-zone behavior, radar UI,
and pin drag.

**Recommendation:** Split by concern:

- `MapAppScreen.navigation.test.tsx`
- `MapAppScreen.radarQuestions.test.tsx`
- `MapAppScreen.hidingZones.test.tsx`
- `MapAppScreen.playArea.test.tsx`
- shared helpers under `src/screens/__tests__/helpers/`

### P1: `MainDrawer.tsx` still combines navigation machinery and content

`MainDrawer` owns transition state/timers, hardware back, edge-swipe gesture,
route wrappers, and the route content switch.

**Recommendation:** Extract a `useSheetRouteTransition` hook and a typed route
registry. Keep `MainDrawer` as the orchestrator that renders current/leaving
route content through the transition wrapper.

### P2: MapLibre and bottom-sheet typing is still too loose

`mapLibrePrimitives.ts`, `NativeMap.tsx`, and `AppBottomSheet.tsx` still use
`ComponentType<any>` casts for native components with incomplete upstream types.

**Recommendation:** Centralize all casts in typed facade modules:

- `src/features/map/mapLibrePrimitives.ts` should also export typed MapView,
  Camera, UserLocation, and the map ref shape.
- Add a bottom-sheet facade for the small prop surface this app uses.
- Re-enable `@typescript-eslint/no-explicit-any` as a warning after shims are
  isolated, with test files or shim files exempted if needed.

### P2: Pin drag still uses an artificial revision counter

`usePinDrag` keeps draft coordinates in a ref and increments a `tick` state so
consumers re-render. This is functional but no longer the simplest shape.

**Recommendation:** Since coordinate updates are already RAF-throttled, store
`draftCoordinate` in state and keep refs only for async gesture guards. Remove
the public `revision` field.

### P2: Persistence writes full snapshots on each app-state change

`AppStatePersistenceCoordinator` persists the full v1 snapshot after restore
whenever play area, hiding-zone settings, pin lock, or questions change. The
payload can include full play-area GeoJSON.

**Recommendation:** Debounce writes around high-frequency edits. Longer term,
persist reconstructable play areas by relation/cache key rather than inlining
large boundary geometry in every snapshot.

### P2: Store contexts expose raw state and derived map data together

`HidingZoneProvider` exposes setup state plus route/station/zone GeoJSON.
`QuestionProvider` exposes question state plus combined map render state.

**Recommendation:** Keep provider state focused on mutable app state and move
map render derivation into selector hooks such as `useHidingZoneMapRenderState`
and `useQuestionMapRenderState`.

### P2: Hooks dependency linting is not enabled

The app uses hooks heavily, including persistence hydration effects that rely on
stable callbacks. ESLint does not currently include `eslint-plugin-react-hooks`.

**Recommendation:** Add the hooks plugin and fix or explicitly document any
intentional dependency exceptions.

### P3: Shared sheet UI primitives are only partially adopted

`SheetListRow` exists, but play-area result rows, hiding-zone preset rows,
drawer actions, question rows, and several buttons still duplicate the same
Pressable/card/title/metadata styles.

**Recommendation:** Extend `SheetListRow` with selected state, trailing labels,
and compact variants. Add a tiny `SheetHeader` for eyebrow/title/detail copy.

### P3: Question map render types live under radar

`QuestionMapRenderState` is defined in `radarTypes.ts`, but it now includes
matching/transit-line render state too.

**Recommendation:** Move cross-question render-state types to
`questionGeometry.ts` or `questionTypes.ts`.

### P3: Pure question mutators still live in `questionStore.tsx`

Radar update helpers are pure domain functions but live in the generic React
store module.

**Recommendation:** Move radar-specific mutations/display helpers to
`features/questions/radar/radarUpdaters.ts` and keep the provider focused on
state wiring.

### P3: Theme tokens are still incomplete

Several components still hardcode semantic colors for destructive actions,
selected backgrounds, sheet handle, map masks, and info states.

**Recommendation:** Extend `src/theme/colors.ts` with semantic tokens before
another UI pass, then migrate hardcoded hex values opportunistically.

## Testing Priorities

1. Add `PlayAreaScreen` search debounce/stale-response tests.
2. Split `MapAppScreen.test.tsx` by feature area.
3. Add focused tests for `MainDrawer` transition/back-target behavior after the
   transition hook is extracted.
4. Add direct UI tests for radar distance picker edge cases, building on the
   existing hook/store coverage.

## Documentation Notes

- `docs/native-map-refactor.md` is now a completed historical plan with only
  residual follow-ups.
- `docs/codebase-refactor-plan.md` tracks remaining structural cleanup outside
  the completed NativeMap split.
- `docs/implementation_notes.md` should be kept current when persistence,
  native setup, or E2E facts change.

## Related Documents

- [`AGENTS.md`](../AGENTS.md) — contributor/agent guide
- [`implementation_notes.md`](./implementation_notes.md) — native, map, E2E,
  and milestone notes
- [`native-map-refactor.md`](./native-map-refactor.md) — completed NativeMap
  refactor record
- [`codebase-refactor-plan.md`](./codebase-refactor-plan.md) — remaining
  structural cleanup plan
