# NativeMap Refactoring Status

**Status:** Mostly complete as of 2026-05-28.

This document used to describe the plan for splitting a roughly 685-line
`NativeMap.tsx`. That work has landed. Keep this file as a short historical
record plus the remaining cleanup items.

## Completed

- `getEventCoordinate` moved to `src/features/map/eventCoordinate.ts`.
- Pin drag moved to `src/features/map/usePinDrag.ts`.
- Map controls moved to `src/features/map/MapControls.tsx`.
- Map layer groups moved into focused components:
    - `PlayAreaMaskLayers`
    - `HidingZoneLayers`
    - `RadarQuestionLayers`
    - `PlayAreaBoundaryLayer`
    - `ActivePinLayer`
- MapLibre primitive casts were partly centralized in
  `src/features/map/mapLibrePrimitives.ts`.
- Focused unit tests now cover event coordinate parsing and pin drag behavior.

## Remaining Follow-Ups

### 1. Finish typed MapLibre facades

`NativeMap.tsx` still casts `MapView`, `Camera`, and `UserLocation` locally, and
keeps the map ref as `any`.

Move those casts into `mapLibrePrimitives.ts`, define the app's minimal map ref
shape there, and keep all incomplete upstream type workarounds in one file.

### 2. Simplify pin drag draft state

`usePinDrag` still uses a ref plus a `revision` counter to force re-renders.
Since the hook already RAF-throttles coordinate projection, plain
`useState<Position | null>` for `draftCoordinate` should be simpler. Keep refs
only for async gesture guards and cleanup.

### 3. Revisit map-press pin movement deferral

`NativeMap` still uses `setTimeout(..., 0)` before committing a map-tap pin
move. Document the ordering issue being avoided or replace it with an explicit
drag/press guard.

### 4. Keep new question overlays outside `NativeMap`

Future question families should add derived render state and focused layer
components instead of teaching `NativeMap` type-specific rendering logic.

## Non-Goals

- Changing MapLibre layer ordering.
- Changing camera-fit behavior.
- Introducing a new state-management library.
- Rewriting map E2E flows as part of this cleanup.
