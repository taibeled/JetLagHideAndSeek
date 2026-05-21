# Code Quality Audit

**Date:** 2026-05-21  
**Scope:** Expo SDK 54 React Native app (`src/`, `app/`, sharing wire format, tests, tooling)  
**Auditor role:** Senior software engineer / quality review

## Executive summary

This codebase is in **good health for its current milestone**. Architecture direction is sound: feature folders, thin screen coordinators, pure domain helpers, and derived map render state. Tooling is clean (`pnpm check` and `pnpm test` both pass; 162 tests across 21 suites), TypeScript runs in strict mode, and accessibility linting is enabled.

The main risks are **concentration of complexity** in a few large files (`NativeMap.tsx`, `MainDrawer.tsx`, `MapAppScreen.test.tsx`), **type-safety workarounds** around MapLibre and Gorhom bottom sheet, and **scaling gaps** as more question types and map overlays are added. None of these block current development, but they should be addressed before the feature surface doubles again.

**Overall grade: B+** — well-structured foundation with deliberate mobile patterns; needs decomposition and a few RN hardening passes before growth accelerates.

---

## Methodology

Review covered:

- Source layout and module boundaries
- State management and persistence
- Map / sheet / question rendering pipeline
- Sharing wire format and import/export flows
- Test distribution and mocking strategy
- ESLint, Prettier, TypeScript, and Jest configuration
- React Native idioms (gestures, safe area, accessibility, lists, performance)
- Existing project docs (`AGENTS.md`, `docs/implementation_notes.md`)

Commands run during audit:

```bash
pnpm check   # lint + format:check + typecheck — passed
pnpm test    # 21 suites, 162 tests — passed
```

---

## Strengths

### Architecture and separation of concerns

- **Feature-based layout** (`src/features/map`, `sheet`, `playArea`, `hidingZone`, `questions`) keeps domain code discoverable.
- **`MapAppScreen` is a thin coordinator** (~50 lines): map, FAB, and bottom sheet only. This matches the intended `mobile app state → derived map render state → NativeMap → AppBottomSheet` shape described in `AGENTS.md`.
- **Pure geometry and data helpers** (`camera.ts`, `maskBuilder.ts`, `hidingZone.ts`, `radarGeometry.ts`, `playAreaBoundary.ts`) are unit-tested independently of React, which is the right split for map math and GeoJSON work.
- **Question extensibility** uses a registry (`questionRegistry.ts`) plus type-specific configs. `QuestionDetailScreen` dispatches by type; radar logic lives in `RadarQuestionDetailScreen` and `useRadarDistanceDraftInput`.
- **Sharing module** is well-factored: Zod schemas, canonical JSON, minified wire keys, base64url + deflate codec, and explicit error codes.

### React Native idioms done well

- Root layout correctly wraps **GestureHandlerRootView** and **SafeAreaProvider** before app state providers.
- **One persistent `@gorhom/bottom-sheet`** with fixed snap points and `enableDynamicSizing={false}` — avoids known v5 snap surprises documented in `AGENTS.md`.
- **SheetScrollView** centralizes scroll + keyboard behavior for overflow drawer routes.
- **Hardware back** and edge-swipe back in `MainDrawer` use `BackHandler` and `Gesture.Pan` appropriately.
- **MapLibre layer ordering** keeps `ShapeSource`/layer children before marker-like overlays; conservative style expressions (filtered layers with literal radii for station rings).
- **Geographic hiding-zone circles** use Turf polygons, not pixel-radius circles — correct for eligibility geometry.
- **Centralized Jest mocks** in `jest.setup.ts` for MapLibre, Reanimated, Gorhom, AsyncStorage, and expo-location — avoids per-test mock drift.

### Code health signals

| Signal                                    | Status           |
| ----------------------------------------- | ---------------- |
| ESLint (incl. `eslint-plugin-rn-a11y`)    | Pass             |
| Prettier                                  | Pass             |
| TypeScript `strict: true`                 | Pass             |
| `@ts-ignore` / `eslint-disable` in `src/` | None found       |
| `console.log` in `src/`                   | None found       |
| Path alias `@/*`                          | Consistent usage |

### Testing

- Strong coverage of **domain logic** (camera, masks, play area, hiding zones, wire codec, persistence migration).
- **Integration-style tests** for `MapAppScreen` exercise real provider wiring, map layer props, sheet navigation, and persistence — high confidence for regressions.
- Maestro E2E stack exists for smoke, play area, hiding zone, and radar flows (not re-run during this audit).

### Documentation

- **`AGENTS.md`** is unusually thorough for agent/human onboarding: native build rules, MapLibre constraints, E2E accessibility caveats, and feature boundaries.
- **`docs/implementation_notes.md`** captures milestone-specific debugging facts.

---

## Findings

Findings are grouped by severity:

- **High** — likely to cause bugs, maintenance pain, or scaling blocks soon
- **Medium** — real cost, but manageable at current size
- **Low** — polish, consistency, or future-proofing

### 1. Architecture and maintainability

#### H-1: `NativeMap.tsx` is a god component (~685 lines)

`NativeMap` currently owns:

- Play-area and combined inside/outside masks
- Hiding-zone routes, stations, and merged zones
- Radar question overlays (preview, miss mask, outlines, active pin)
- Pin drag gesture (long-press pan, RAF-throttled coordinate projection)
- Map tap-to-move pin with deferred `setTimeout(0)` update
- Top chrome and icon-only map controls
- User location integration

This partially contradicts the stated direction in `AGENTS.md`: _"Avoid teaching NativeMap every future question family directly"_ and _"Keep MapAppScreen as a coordinator."_

**Impact:** Each new question type adds layers, gestures, and conditionals here. Review and test surface grows quickly.

**Recommendation:** Introduce a map overlay composition layer, e.g. `useMapOverlayLayers()` or small presentational subcomponents (`PlayAreaLayers`, `HidingZoneLayers`, `QuestionOverlayLayers`, `ActivePinOverlay`) fed by derived render state from `questionGeometry` / future question builders. Keep gesture logic in a dedicated hook (`useRadarPinInteraction`).

#### H-2: `MapAppScreen.test.tsx` is ~1,400 lines

A single test file mixes navigation, map layer assertions, geometry math, persistence, keyboard dismissal, and hiding-zone preset behavior.

**Impact:** Hard to navigate, slow to extend, high merge-conflict risk.

**Recommendation:** Split by concern:

- `MapAppScreen.navigation.test.tsx`
- `MapAppScreen.mapLayers.test.tsx`
- `MapAppScreen.persistence.test.tsx`
- Shared helpers in `MapAppScreen.testHelpers.ts`

#### M-1: `MainDrawer.tsx` combines navigation stack, animation, and route rendering (~525 lines)

Custom stack transitions (Reanimated shared values, dual-layer enter/leave, cleanup timers) live alongside a large `renderRouteContent` switch and duplicated back-button chrome.

**Impact:** Sheet navigation is the app's primary UX spine; complexity here affects every new route.

**Recommendation:** Extract `SheetNavigator` (transition state machine) from route bodies. Consider a typed route config map `{ route, component, snapIndex, backTarget }` instead of a growing switch.

#### M-2: Duplicated UI patterns across screens

Eyebrow / title / detail typography, settings-style action rows, and
destructive buttons are reimplemented with near-identical `StyleSheet` blocks in
`MainDrawer`, `SettingsScreen`, `PlayAreaScreen`, `HidingZoneScreen`,
`QuestionsScreen`, and radar detail. The `m`/`km`/`mi` segmented unit control has
since been extracted to `src/components/UnitSegmentedControl.tsx`.

**Impact:** Visual drift and repetitive styling changes.

**Recommendation:** Small shared primitives (`SheetHeader`, `SettingsRow`,
`DestructiveButton`) in `src/features/sheet/components/` or `src/ui/`. Keep them
dumb and styled from `colors.ts`.

#### M-3: Context stores bundle large derived values

`HidingZoneProvider` exposes GeoJSON feature collections (`routeFeatures`, `stationFeatures`, `zoneFeatures`) alongside settings state. Any consumer of `useHidingZone()` re-renders when any slice changes unless selectively destructured.

**Impact:** Low today because few consumers exist. Will matter if map-adjacent UI reads the full hook.

**Recommendation:** Split read-only derived selectors (custom hooks or memoized sub-contexts) from mutable setup state before adding hider mode, timers, or live game state.

#### L-1: `questionStore.tsx` mixes React state with pure update helpers

Functions like `updateRadarQuestionCenter` and `updateRadarDistanceOption` live in the store module but are pure domain updaters.

**Recommendation:** Move pure updaters to `src/features/questions/radar/radarMutations.ts` (or similar); keep the provider focused on state wiring.

---

### 2. Type safety

#### M-1: Pervasive `ComponentType<any>` casts for MapLibre and bottom sheet

```tsx
const MLMapView = MapView as ComponentType<any>;
const Sheet = BottomSheet as ComponentType<any>;
```

ESLint explicitly disables `@typescript-eslint/no-explicit-any`. MapLibre RN and Gorhom typings are incomplete, so this is a pragmatic workaround — but it removes prop checking on the most complex UI surface.

**Recommendation:**

1. Add ambient module augmentation under `src/types/maplibre-react-native.d.ts` for the props actually used.
2. Wrap MapLibre primitives in thin typed facades (`TypedMapView`, `TypedShapeSource`) so casts live in one file.
3. Re-enable `no-explicit-any` as `warn` for new code outside those shim files.

#### M-2: Gesture event handlers typed as `any`

`NativeMap` pin drag uses `(event: any)` for pan callbacks. Prefer importing gesture handler event types or defining a minimal `{ absoluteX: number; absoluteY: number }` interface.

---

### 3. React Native idioms and UX

#### M-1: Map controls are emoji-only without accessibility labels

`MapControl` renders `🗺️` and `📍` with `accessibilityRole="button"` but **no `accessibilityLabel`**. This matches the known E2E sharp edge in `AGENTS.md` and fails rn-a11y expectations for icon-only controls.

**Recommendation:** Add labels (`"Fit play area"`, `"Locate me"`) and align Jest + Maestro selectors on those labels or stable `testID`s on the `Pressable`.

#### M-2: Pin drag uses a `tick` counter to force re-renders from a ref

During drag, draft coordinates live in `draftPinCoordinateRef` and `setTick((t) => t + 1)` triggers renders. This works but is non-idiomatic in Reanimated/Gesture Handler setups.

**Recommendation:** Prefer `useSharedValue` + animated styles for the drag preview, or store draft coordinates in `useState` throttled by the existing RAF gate.

#### M-3: `setTimeout(..., 0)` on map press for pin placement

```tsx
setTimeout(() => {
    updateQuestion(questionId, (question) =>
        updateRadarQuestionCenter(question, coordinate),
    );
}, 0);
```

Suggests a race with map press handling or gesture finalization.

**Recommendation:** Document the race being avoided, or replace with explicit ordering (e.g. only update on press when not dragging, using `isDraggingRef` guard without deferral).

#### L-1: No React error boundaries

A runtime exception in map rendering or sheet navigation will white-screen the app.

**Recommendation:** Add a top-level error boundary with a minimal recovery UI ("Something went wrong — restart setup") for dev builds and production.

#### L-2: No `FlatList` usage

All lists use `ScrollView` + `.map()`. Acceptable for small preset/search result sets today.

**Recommendation:** Switch to `FlatList` if question lists or search results grow beyond ~20 rows.

---

### 4. Performance and persistence

#### M-1: App state persistence writes the full snapshot on every change

`AppStatePersistenceCoordinator` calls `persistAppState(createAppStateV1(...))` whenever play area, hiding zones, pin lock, or questions change. The persisted payload includes the **full play-area GeoJSON boundary**, which can be large.

**Impact:** Typing in hiding-zone radius, toggling presets, or editing questions triggers JSON.stringify + AsyncStorage writes of the entire state including boundary geometry. No debounce or diffing.

**Recommendation:**

1. Debounce persistence (300–500 ms) for high-frequency edits.
2. Longer term: persist play area by `osmId` + cache key when boundary is reconstructable from bundled/AsyncStorage cache, not inline GeoJSON every time.
3. Consider persisting only after `isRestored` AND idle period.

#### L-1: `playArea` object in persist effect dependencies

The effect depends on `playAreaStore.playArea`. Any new object reference triggers persist even if values are equal. Currently mitigated because updates replace state intentionally.

---

### 5. Testing gaps

| Area                                  | Unit / component tests | E2E                   |
| ------------------------------------- | ---------------------- | --------------------- |
| Map domain (camera, masks, play area) | Strong                 | Partial               |
| State stores                          | Strong                 | —                     |
| Wire format / import                  | Strong                 | —                     |
| `NativeMap`                           | Moderate               | —                     |
| `MapAppScreen` integration            | Very large single file | Maestro               |
| `PlayAreaScreen`                      | None                   | Maestro (coordinates) |
| `HidingZoneScreen`                    | None                   | Maestro               |
| `MainDrawer` transitions              | None                   | —                     |
| `RadarQuestionDetailScreen`           | None                   | Maestro               |
| `ShareSetupModal`                     | None                   | —                     |
| `QuestionsScreen` / swipe delete      | None                   | —                     |

**Recommendation priorities:**

1. Extract and test `MainDrawer` transition logic in isolation (direction, cleanup timer, back target).
2. Component tests for `PlayAreaScreen` search debounce and relation apply (mock Photon).
3. Radar detail hook tests already partially covered via store; add UI tests for distance draft input edge cases.

#### L-1: Jest suppresses `act(...)` warnings globally

`jest.setup.ts` filters React Testing Library `act` warnings. This hides async state update smells.

**Recommendation:** Remove the filter once tests use `act`/`waitFor` consistently, or scope suppression to specific legacy tests.

---

### 6. Theming and consistency

#### M-1: Hardcoded hex colors outside `colors.ts`

Examples:

| Location                   | Color                           | Purpose                  |
| -------------------------- | ------------------------------- | ------------------------ |
| `NativeMap.tsx`            | `#07111f`, `#e46f4d`, `#ffffff` | Masks, radar, pin glow   |
| `MainDrawer.tsx`           | `#e6f2ef`                       | Active action background |
| `QuestionDetailScreen.tsx` | `#d92d20`                       | Delete button            |
| `AppBottomSheet.tsx`       | `#b8b1a4`                       | Handle indicator         |

**Recommendation:** Extend `src/theme/colors.ts` with semantic tokens (`mapMask`, `radarAccent`, `destructive`, `sheetHandle`) and reference them from components.

---

### 7. Documentation and repo hygiene

#### M-1: Doc drift on persistence milestone

`docs/implementation_notes.md` still states play area and hiding zones are _"not persisted yet"_ in places, while `AppStateProviders` + `persistence.ts` now persist full app state v1. `AGENTS.md` also mixes milestone language.

**Recommendation:** Update milestone docs to reflect current persistence behavior and what remains (e.g. UI settings, hider mode).

#### L-1: Package name vs repo name

`package.json` `"name": "mobile_v2"` vs repo `JetLagHideAndSeek`. Harmless but confusing in logs and deep links.

#### L-2: Legacy / planning docs overlap

`docs/overall.md`, `docs/repo_refactor_plan.md`, and `docs/mobile_v2_notes.md` may predate current architecture.

**Recommendation:** Add a short `docs/README.md` index pointing to canonical docs (`AGENTS.md`, `implementation_notes.md`, this audit).

---

## React Native idioms checklist

| Practice                           | Verdict     | Notes                                               |
| ---------------------------------- | ----------- | --------------------------------------------------- |
| Safe area handling                 | Good        | `useSafeAreaInsets`, `useSafeAreaFrame`, FAB offset |
| Gesture handler root               | Good        | Imported first in `_layout.tsx`                     |
| Keyboard dismiss on sheet collapse | Good        | `AppBottomSheet`                                    |
| Pressable vs TouchableOpacity      | Good        | Pressable used consistently                         |
| Accessibility roles/labels         | Mixed       | Strong on sheet rows; weak on map emoji controls    |
| Reanimated + worklets              | Good        | `runOnJS` used for gesture callbacks                |
| Image assets                       | Good        | Bundled question pin PNG                            |
| Platform-specific shadows          | Good        | `Platform.select` in map controls                   |
| Hermes / new architecture          | Not audited | Expo 54 defaults assumed                            |
| Android parity                     | Unknown     | E2E and docs focus on iOS                           |

---

## Prioritized recommendations

### P0 — Do before adding another question type

1. **Decompose `NativeMap`** into overlay modules + interaction hook.
2. **Add accessibility labels** to map controls.
3. **Split `MapAppScreen.test.tsx`** into focused files.

### P1 — Next quality sprint

4. Debounce or optimize **persistence writes**.
5. Introduce **typed MapLibre / bottom-sheet shims** to reduce `any`.
6. Extract **shared sheet UI primitives** to reduce style duplication.
7. **Component tests** for `MainDrawer` navigation and `PlayAreaScreen` search.

### P2 — Hardening and polish

8. Semantic **theme tokens** for map and destructive colors.
9. Top-level **error boundary**.
10. Reconcile **documentation** with persistence milestone.
11. Move pure question mutators out of `questionStore.tsx`.

---

## Test and tooling summary

```
Test suites:  21 passed
Tests:        162 passed
Lint:         clean
Format:       clean
Typecheck:    strict, clean
```

Approximate source distribution (excluding tests):

- ~89 TypeScript/TSX files under `src/` and `app/`
- Largest production files: `NativeMap.tsx`, `MainDrawer.tsx`, `ShareSetupModal.tsx`, `RadarQuestionDetailScreen.tsx`
- Largest test file: `MapAppScreen.test.tsx` (larger than any production module)

---

## Conclusion

The project reads as a **disciplined mobile rewrite**, not a web port. Boundaries between map math, state, and UI are mostly respected; tests and tooling give real confidence. The codebase is maintainable **today** but approaching the point where two "god files" (`NativeMap`, `MapAppScreen.test.tsx`) and a custom sheet navigator will dominate review time.

Invest in decomposition and typed map/sheet wrappers before implementing matching, measuring, tentacles, and thermometer questions — the registry and render-state pipeline are already pointing the right way.

---

## Related documents

- [`AGENTS.md`](../AGENTS.md) — agent/onboarding guide (canonical for contributors)
- [`docs/implementation_notes.md`](./implementation_notes.md) — native, map, and E2E setup notes
- [`docs/overall.md`](./overall.md) — original product sketch (may be stale)
- [`docs/repo_refactor_plan.md`](./repo_refactor_plan.md) — historical refactor planning
