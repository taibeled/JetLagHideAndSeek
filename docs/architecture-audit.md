# Codebase Architecture Audit

**Date:** 2026-05-30  
**Scope:** Major structural / architectural issues in the Expo SDK 54 React Native Hide & Seek mapper.  
**Method:** Static analysis of source, config, tests, and CI; cross-referenced against `AGENTS.md` conventions.

---

## Severity Legend

| Icon | Meaning                                                                                  |
| ---- | ---------------------------------------------------------------------------------------- |
| 🔴   | High — likely to cause bugs, crashes, or significant maintenance burden                  |
| 🟡   | Medium — architectural debt that will slow future development or cause occasional issues |
| 🟢   | Low — cleanup / polish; should be addressed when touching nearby code                    |

---

## 1. State Management Architecture

### 🔴 Heavy derived state computed inside React Context providers

**Locations:**

- `src/state/hidingZoneStore.tsx` lines 73–101 — rebuilds `routeFeatures`, `stationFeatures`, `zoneFeatures` via `useMemo` on every radius/preset change.
- `src/state/questionStore.tsx` lines 81–89 — rebuilds `questionMapRenderState` via `useMemo`, iterating all questions and generating GeoJSON masks.

**Impact:** Any consumer of `useHidingZone()` or `useQuestion()` re-renders even if it only cares about a single scalar (e.g., `radiusUnit`). `NativeMap` subscribes to all three contexts and re-renders its entire layer tree on trivial state changes.

**Recommendation:** Move expensive derived GeoJSON / render-state computation out of the context value. Expose it through a separate, granular hook (or a lightweight store like Zustand/Jotai with selectors) so that `NativeMap` can subscribe to slices without re-rendering on unrelated changes.

### 🟡 UI state leaked into domain stores

**Locations:**

- `src/state/questionStore.tsx` line 71 — `isQuestionSheetActive` is sheet navigation state, not question domain state.
- `src/features/sheet/AppBottomSheet.tsx` lines 66–68 — an effect syncs sheet route into the question store.

**Impact:** Creates coupling between the bottom-sheet feature and the question feature. The map also reads `isQuestionSheetActive` to toggle pin visibility, spreading sheet concerns into the map feature.

**Recommendation:** Let the sheet own its own route/index state. Derive `isQuestionSheetActive` from `AppBottomSheet`'s internal route or from a dedicated `SheetProvider`.

### 🟡 Effect-based derived-state write-back

**Location:** `src/features/questions/transitLine/TransitLineQuestionDetailScreen.tsx` lines 33–41

This `useEffect` auto-mutates question state whenever hiding-zone-derived `lineOptions` change. It is derived state writing back to source, which can cause cascading updates and makes data flow hard to trace.

**Recommendation:** Keep the question as the single source of truth. Derive `lineOptions` at read time or use a memoized selector, rather than mutating the question record in an effect.

### 🟢 State providers mix business logic with React Context boilerplate

**Locations:**

- `src/state/questionStore.tsx` (402 lines) contains question creation, normalization/migration, radar-specific update helpers, and geometry display helpers.
- `src/state/hidingZoneStore.tsx` contains GeoJSON construction.
- `src/state/playAreaStore.tsx` contains async loading + network calls.

**Recommendation:** Extract business logic into pure functions / hooks in `features/*/` and keep the providers as thin Context wrappers around generic CRUD operations.

---

## 2. Feature Organization & Boundaries

### 🔴 Circular type dependencies in `features/questions/`

**Cycle A:** `questionTypes.ts` ↔ `radarTypes.ts`  
**Cycle B:** `questionTypes.ts` ↔ `transitLineTypes.ts`  
**Cycle C:** `radarTypes.ts` → `transitLineTypes.ts` → (indirectly back through `questionTypes.ts`)

Madge reports no _runtime_ circulars, but the type graph is entangled. This makes incremental compilation slower and increases the blast radius of type changes.

**Recommendation:** Introduce a `questions/coreTypes.ts` that defines `BaseQuestion`, `QuestionAnswer`, `QuestionType` without importing leaf types. Have leaf types import from core. `questionTypes.ts` can re-export for consumers.

### 🟡 Features import from sibling features (violating boundary rules)

**Examples:**

- `features/map/usePinDrag.ts` → `features/questions/questionTypes`
- `features/questions/*` → `features/map/useUserLocation`
- `features/questions/*` → `features/hidingZone/*`
- `features/hidingZone/*` → `features/map/geojsonTypes`

**Recommendation:** Move shared types like `Position`, `Bbox`, and `bboxIntersects` into `src/shared/geojson.ts` or `src/shared/geometry.ts`. Move `requestUserCoordinate` to `src/shared/location.ts` or a map-agnostic location utility. Features should import from `shared`, not from each other.

### 🟡 `sharing/` layer imports feature internals

**Locations:**

- `sharing/import/applyImport.ts` → `features/map/playArea`
- `sharing/export/buildEnvelope.ts` → `features/hidingZone/hidingZoneTypes`
- `sharing/wire/schema.ts` → `features/map/geojsonTypes`, `features/questions/transitLine/transitLineNormalization`

**Impact:** Changes to feature types propagate into the wire-format schema, breaking import/export compatibility.

**Recommendation:** Define wire-format types independently in `sharing/wire/types.ts`. Have features provide normalization adapters, rather than the sharing layer importing feature internals.

### 🟢 Monolithic router / UI components

**Location:** `features/sheet/MainDrawer.tsx` (623 lines)

Contains inline route registry, Reanimated animation logic, gesture handling, back-target resolution, and inline sub-components (`DrawerAction`, `ChildSheetShell`, `BackButton`).

**Recommendation:** Extract the route registry to a route-to-component map. Extract sub-components to dedicated files. Keep `MainDrawer` focused on coordination.

---

## 3. Map Integration & Native Dependencies

### 🔴 MapLibre iOS native crash risk from complex style expressions

**Location:** `src/features/map/HidingZoneLayers.tsx` lines 52–64

```js
lineWidth: ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 2, 13, 4, 16, 7];
```

AGENTS.md explicitly warns that _complex numeric expressions on MapLibre styles have crashed native MapLibre on iOS_. Even though this is `lineWidth`, the same native expression engine is involved.

**Recommendation:** Split into separate filtered `LineLayer`s per zoom range with literal numeric widths.

### 🟡 New Architecture (Fabric) + heavy native modules = high-risk combo

**Location:** `app.json` line 10 — `"newArchEnabled": true`

The app runs `@maplibre/maplibre-react-native`, `react-native-reanimated`, and `@gorhom/bottom-sheet` on Fabric/TurboModules. While the pinned versions claim support, this is the highest-risk configuration for subtle native crashes. The only automated validation is Maestro E2E; there is no native unit test coverage.

**Recommendation:** Monitor for native crashes in E2E and production. Consider keeping a baseline `oldArchEnabled` build for comparison if Fabric-specific regressions appear. Add a CI step that at least runs `expo prebuild --platform ios` to validate plugin / Podfile.lock drift.

### 🟡 Camera helper API mismatch

**Location:** `src/features/map/camera.ts`

`CameraHandle.fitBounds` is typed as an imperative ref method, but MapLibre RN v10's `Camera` ref does not expose `fitBounds`. The fallback to `setCamera` works, but the type implies a method that likely does not exist.

**Recommendation:** Remove `fitBounds` from the `CameraHandle` type and rely solely on `setCamera` with a `bounds` object.

### 🟡 Unmemoized layer components cause unnecessary subtree re-renders

**Locations:**

- `PlayAreaBoundaryLayer`, `PlayAreaMaskLayers`, `RadarQuestionLayers`, `HidingZoneLayers`, `ActivePinLayer`

When `NativeMap` re-renders (e.g., due to a question state change), all these components re-render even if their props are unchanged.

**Recommendation:** Wrap each layer component in `React.memo`.

### 🟢 Heavy polygon re-computation on every question change

**Location:** `src/features/map/NativeMap.tsx` lines 75–99

`combinedInsideMask` is computed via `buildCombinedEligibilityMask` (heavy `polyclip-ts` operations) with 6 dependencies. Every radar answer toggle, transit line selection, or hiding-zone radius change triggers a full polygon union/intersection/difference pass.

**Recommendation:** Extract `combinedInsideMask` computation into a derived hook. Consider throttling or using structural sharing for the GeoJSON result.

---

## 4. Testing Strategy

### 🟡 Critical path coverage gaps

**Missing tests:**

- No dedicated unit tests for `RadarQuestionLayers`, `PlayAreaMaskLayers`, `PlayAreaBoundaryLayer`, `MapControls`, or `ActivePinLayer`.
- `NativeMap.test.tsx` does not test map-press pin movement, combined masks, or `UserLocation` conditional toggling.
- `usePinDrag.test.ts` does not test `handleDragFinalize`, unmount cleanup, or null `mapRef` error paths.
- `playAreaBoundary.test.ts` does not test `MultiPolygon` boundaries or `getBoundaryLabel` fallback.

**Recommendation:** Add focused component tests for each layer. Add integration tests that verify `NativeMap` passes correct `ShapeSource.shape` props without re-render loops.

### 🟡 E2E brittleness

**Locations:**

- `e2e/play-area.yaml`, `e2e/hiding-zone.yaml`, `e2e/radar-question.yaml` rely on percentage-coordinate taps (`point: "38%,39%"`). These break if snap points, font scale, or safe-area insets change.

**Missing E2E:**

- Pin-drag gesture (the most complex map interaction).
- Play-area error paths (invalid relation IDs, Overpass failures).
- Hiding-zone radius change verification.
- Deep-link import flow (`/i`).

**Recommendation:** Replace coordinate taps with stable accessibility labels where possible. Add a pin-drag E2E flow, even if it uses coordinate moves. Add an error-path flow for invalid relation IDs.

### 🟢 Mock quality issues in `jest.setup.ts`

- `__cameraMethods` / `__mapMethods` escape hatches couple tests to mock internals.
- Mocked `Camera` renders children inside a `View`; the real component does not.
- Reanimated mock returns primitives (`0`) instead of shared-value-like objects.
- `Gesture.Pan()` mock silently drops callbacks if `activateAfterLongPress` was not called first.
- Console-error suppression hides genuine `act(...)` warnings.

**Recommendation:** Gradually tighten mocks to match real component contracts. Remove blanket console-error suppression and fix underlying async test issues.

---

## 5. Configuration & Tooling

### 🟡 Monorepo residue in standalone repo

**Locations:**

- `tsconfig.json` line 10 — `"typeRoots": ["./node_modules/@types", "../node_modules/@types"]` (dead path)
- `jest.config.js` line 5 — `modulePaths: ["<rootDir>/../node_modules"]` (dead path)
- `tsconfig.json` `include` omits `jest.setup.ts`, `jest.config.js`, `scripts/**/*.mjs`, and `data/**/*.mjs`

**Recommendation:** Remove `../node_modules` references. Expand `include` so that test setup and build scripts are type-checked.

### 🟡 Version / dependency drift

- `package.json` version (`0.1.0`) does not match `app.json` version (`0.1.1`).
- `package.json` line 51: `semver` is listed in `dependencies` but never imported in source.
- `@types/react` specifier (`~19.1.10`) is loose enough that patch drift can occur between installs.

**Recommendation:** Align `package.json` and `app.json` versions (or automate sync). Remove unused `semver`. Pin `@types/react` to an exact patch if reproducible type-checking is desired.

### 🟢 Duplicate route

- `app/import.tsx` and `app/i/index.tsx` both export the same `ImportScreen`. The deep-link intent filter only registers `/i`.

**Recommendation:** Consolidate to a single route file, or document the alias if it is intentional.

### 🟢 Missing top-level error boundary / splash control

- `app/_layout.tsx` has no `expo-splash-screen` plugin or manual `SplashScreen.preventAutoHideAsync()` call. With a native map and bottom sheet, first render can be slow; users may see a white flash.
- No top-level React Error Boundary. If `AppStateProviders` or `AppStatePersistenceCoordinator` crashes during restore, the app white-screens.

**Recommendation:** Add `SplashScreen.preventAutoHideAsync()` in the root layout and hide it after initial render. Add an Error Boundary around the app root.

---

## 6. Hardcoded Values That Should Be Configurable

| Value                                                      | Location                     | Risk                                               |
| ---------------------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| `MAX_STATION_COLOR_RINGS = 6`                              | `HidingZoneLayers.tsx:15`    | Stations served by >6 routes silently drop colors. |
| `ROUTE_MIN_ZOOM = 9`, `STATION_MIN_ZOOM = 12`              | `HidingZoneLayers.tsx:16-17` | Not configurable per preset or play area.          |
| `PIN_HIT_RADIUS_PX = 50`                                   | `usePinDrag.ts:10`           | Fixed touch target size.                           |
| `activateAfterLongPress(300)`                              | `usePinDrag.ts:149`          | Fixed drag initiation delay.                       |
| `paddingBottom: height * 0.48`                             | `camera.ts:75-78`            | Magic numbers for sheet snap geometry.             |
| `OVERPASS_API = "https://overpass-api.de/api/interpreter"` | `playAreaBoundary.ts:15`     | Single point of failure; no fallback mirror.       |
| `timeout:60` in Overpass query                             | `playAreaBoundary.ts:79`     | Not configurable.                                  |

---

## Summary: Priority Actions

| Priority | Action                                                                                           | Owner Files                                                              |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| P0       | Refactor `HidingZoneLayers.tsx` zoom-interpolation expression into literal-width filtered layers | `src/features/map/HidingZoneLayers.tsx`                                  |
| P0       | Extract heavy derived GeoJSON out of Context providers into granular selectors / hooks           | `src/state/hidingZoneStore.tsx`, `src/state/questionStore.tsx`           |
| P1       | Break circular type dependencies in `questions/` with `coreTypes.ts`                             | `src/features/questions/*Types.ts`                                       |
| P1       | Stop feature-to-feature imports; move shared types/utilities to `src/shared/`                    | `src/features/*/`, `src/shared/`                                         |
| P1       | Remove monorepo residue (`../node_modules`) from `tsconfig.json` and `jest.config.js`            | `tsconfig.json`, `jest.config.js`                                        |
| P1       | Add `React.memo` to all map layer components                                                     | `src/features/map/*Layer*.tsx`                                           |
| P2       | Move business logic out of state providers                                                       | `src/state/questionStore.tsx`, `src/state/hidingZoneStore.tsx`           |
| P2       | Remove `isQuestionSheetActive` from question store; let sheet own its state                      | `src/state/questionStore.tsx`, `src/features/sheet/AppBottomSheet.tsx`   |
| P2       | Fix transit-line detail effect-based write-back                                                  | `src/features/questions/transitLine/TransitLineQuestionDetailScreen.tsx` |
| P2       | Extract `MainDrawer.tsx` sub-components and route registry                                       | `src/features/sheet/MainDrawer.tsx`                                      |
| P2       | Add unit tests for layer components and pin-drag integration                                     | `src/features/map/__tests__/`                                            |
| P3       | Add CI prebuild validation step                                                                  | `.github/workflows/app-checks.yml`                                       |
| P3       | Consolidate `app/import.tsx` / `app/i/index.tsx`                                                 | `app/import.tsx`, `app/i/index.tsx`                                      |
| P3       | Add splash-screen control and root Error Boundary                                                | `app/_layout.tsx`                                                        |
| P3       | Remove unused `semver` dependency; align versions                                                | `package.json`, `app.json`                                               |
