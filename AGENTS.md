# Agent Guide

This file is for agents working on the Expo app. This is an Expo SDK 54
React Native rewrite of the Hide & Seek mapper, built around a native map and an
Apple Maps-style bottom sheet. Keep changes mobile-first; do not port web UI
patterns wholesale.

## Project Snapshot

- Entry points: `app/_layout.tsx` wraps the app in gesture/safe-area providers,
  and `app/index.tsx` renders `src/screens/MapAppScreen.tsx`.
- Main screen: `MapAppScreen` composes `NativeMap` and `AppBottomSheet` inside
  `PlayAreaProvider` and `HidingZoneProvider`.
- Current milestone: MapLibre map plus Settings -> Play Area, Settings ->
  Hiding Zones, and Questions -> Radar. App-state persistence and the
  copy/paste wire format cover play area, hiding zones, and radar questions.
- Default play area: Tokyo 23 Wards, OSM relation `19631009`, loaded from
  `assets/default-zones/tokyo.json`.
- Deterministic E2E play-area fixture: Osaka, OSM relation `358674`, loaded from
  `assets/default-zones/osaka.json`.
- Hiding-zone presets: Tokyo Metro and Toei Subway, generated from ODPT GTFS
  data in `data/odpt/generated/hiding-zone-presets.json`.

## Commands

Run commands from the repo root.

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm check
pnpm test
pnpm test -- NativeMap.test.tsx
pnpm data:odpt
```

For local app work:

```bash
pnpm exec expo start --dev-client --host localhost --port 8081 -c
```

For the iOS E2E stack:

```bash
pnpm test:e2e:ios:stack
```

That helper starts Metro, runs the Maestro smoke and play-area flows, writes
debug artifacts under `mobile_v2/e2e/artifacts/`, and stops Metro. A simulator
must already be available; the known target has been `iPhone 16 Pro - iOS 18.3`.

## Native Build Rules

- Expo Go will not work. This app uses native modules, especially
  `@maplibre/maplibre-react-native` and AsyncStorage, so use a dev build.
- Do not run Expo native commands from the monorepo root. Use the repo root or
  `pnpm --dir mobile_v2`.
- After adding or changing native dependencies or Expo plugins, regenerate and
  rebuild the native app:

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo prebuild --platform ios --clean
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo run:ios --device "iPhone 16 Pro" --no-bundler
```

- `app.json` must keep the MapLibre plugin. Location copy lives in
  `ios.infoPlist.NSLocationWhenInUseUsageDescription`.
- `babel.config.js` must keep `react-native-reanimated/plugin` last.
- `metro.config.js` pins native singletons. If a new native package starts
  resolving duplicate copies, update Metro intentionally.

## Source Layout

- `src/features/map/`: MapLibre rendering, camera helpers, OSM raster style,
  user location, GeoJSON boundary loading, and play-area math.
- `src/features/sheet/`: one persistent bottom sheet and sheet-route UI.
- `src/features/playArea/`: Play Area settings UI and Photon search mapping.
- `src/features/hidingZone/`: Hiding Zones settings UI, preset data adapters,
  radius/unit helpers, and derived GeoJSON overlays.
- `src/features/questions/`: question catalog, radar question UI/controller,
  question map render-state helpers, and future question type definitions.
- `src/state/`: React state providers. Keep them mobile-specific.
- `data/odpt/`: ODPT source config, fetch script, attribution docs, ignored
  download cache, and checked-in processed preset JSON.
- `src/theme/colors.ts`: shared color tokens for the mobile app.
- `src/types/`: local ambient types for JSON and third-party packages.
- `docs/implementation_notes.md`: milestone-specific native, map, and E2E
  notes. Update it when you learn a new durable setup/debugging fact.

## Architecture Direction

The intended shape is:

```text
mobile app state -> derived map render state -> NativeMap layers
                 -> AppBottomSheet route screens
```

Prefer mobile-specific state and adapters over importing legacy web context.
The web app can be a reference for domain logic, but avoid bringing over
Leaflet, sidebar, browser-storage, or root-controller assumptions.

Keep `MapAppScreen` as a coordinator. Avoid turning it into the owner of every
mode, form, network request, and map side effect. If a new workflow has state,
put that state in a focused feature/store and let the map render derived data.

## MapLibre and Geometry Rules

- MapLibre coordinates are `[longitude, latitude]`.
- Bboxes are `[west, south, east, north]`.
- `ShapeSource`/layer children should stay before marker-like overlays. MapLibre
  RN can behave badly when native children are ordered casually.
- Be conservative with MapLibre RN style expressions on iOS. Feature-driven
  colors such as `["to-color", ["get", "color"], fallback]` are known to work,
  but complex numeric expressions on circle styles have crashed native MapLibre.
  Prefer separate filtered layers with literal numeric radii/widths when the
  visual states are bounded.
- `NativeMap` fits the play area into the upper map area using
  `getTopViewportFitPadding`. If sheet snap points or top chrome change, revisit
  `src/features/map/camera.ts`.
- Keep map camera behavior in small helpers (`camera.ts`) and test it with unit
  tests. This makes native ref behavior easier to mock.
- Use bundled fixtures for deterministic tests where possible. Networked
  Overpass/Photon paths should be mocked in Jest.
- Hiding-zone circles are geographic polygons generated from station points and
  radius meters, then merged before rendering. Do not use MapLibre pixel-radius
  circles for hiding-zone eligibility areas.
- Assert hiding-zone polygon correctness in Jest by inspecting the generated
  GeoJSON and `ShapeSource.shape` props. Maestro should cover the user settings
  workflow and can capture screenshots for agent/debug review, but it should not
  be the source of truth for polygon geometry.

## Bottom Sheet Rules

- Use one persistent `@gorhom/bottom-sheet` for primary navigation.
- Keep fixed snap points paired with `enableDynamicSizing={false}`; v5 can
  otherwise create surprising near-zero snap behavior.
- Current routes live in `src/features/sheet/sheetRoutes.ts`.
- Routes that need more space, such as `play-area`, should snap to the large
  index before E2E tries to interact with their controls.
- Use modals sparingly. Prefer same-sheet routes unless the interaction is a
  destructive confirmation or an import/review flow.
- Drawer screens with content that may overflow the sheet height must use
  `SheetScrollView` (`src/features/sheet/SheetScrollView.tsx`) instead of a
  plain `ScrollView`. It provides consistent bottom padding (`40px`) and
  `keyboardShouldPersistTaps="handled"` by default. Pass per-screen styles
  via `style` and `contentContainerStyle` props; do not duplicate `flex: 1`
  or `paddingBottom` since the component owns those.

## Play Area Rules

- `loadPlayAreaByRelationId` handles bundled Tokyo, bundled Osaka, memory cache,
  AsyncStorage cache, and Overpass fetch in that order.
- The selected play area is currently in memory only. Do not imply persistence
  in UI or tests until milestone 4 state persistence exists.
- `searchPlayAreas` queries Photon and keeps relation results only
  (`osm_type === "R"`). Tests should exercise mapping/deduping without network.
- When accepting direct relation IDs, keep validation strict: positive safe
  integer strings only.
- Store distances internally in meters, even if display units are km or miles.

## Hiding Zone Rules

- Hiding-zone state is currently in memory only. Do not imply persistence in UI
  or tests yet.
- Preset suggestions use bbox intersection with the current play-area bbox.
  Suggestions are not auto-selected.
- Preset selection is additive. Removing one preset should not remove a station
  that is still contributed by another selected preset.
- Radius display units are `m`, `km`, and `mi`; `HidingZoneProvider` stores the
  canonical value in meters.
- Route and station overlay colors should come from generated preset route
  colors. Stations may be contributed by more than one selected route, so render
  multiple colors as concentric station rings instead of choosing a single
  arbitrary transfer color.
- ODPT generated data is checked in, but raw GTFS zips live in ignored
  `data/odpt/cache/`.
- Some GTFS feeds, including cached Tokyo Metro data seen during development,
  may omit `shapes.txt` or route `shape_id` values. Preserve the fallback that
  derives route geometry from ordered `stop_times` so generated route lines do
  not silently become empty while colors still exist.
- `data/odpt/scripts/fetch-odpt.mjs --cache-only` is useful for regenerating
  checked-in preset JSON from ignored cached GTFS zips when network access or
  `ODPT_KEY` is unavailable.
- Keep `data/odpt/NOTICE.md` and `data/odpt/sources.md` current when adding or
  refreshing ODPT providers. Generated JSON also carries an attribution block.
- `pnpm data:odpt` requires network access and `ODPT_KEY` for
  Tokyo Metro.

## Question Rules

- Use original game terminology: the circle question is `radar`, not `radius`.
  Hiding-zone station buffers are still radius-based, so keep that terminology
  in hiding-zone code and UI.
- The generic question shape lives in `src/features/questions/questionTypes.ts`
  and `src/features/questions/questionCatalog.ts`. Add new question families to
  the catalog first, and expose them in Add Question only once their UI/state
  behavior is implemented.
- `QuestionDetailScreen` should stay a thin host that dispatches by question
  type. Keep type-specific editing logic in focused detail components/hooks,
  like `useRadarDistanceDraftInput`.
- `QuestionProvider` exposes generic creation/update/delete state. Prefer
  `createQuestion` and `updateQuestion` plus type-specific helpers over adding
  one-off global setters for each question family.
- Radar questions store `distanceMeters`, `distanceOption`, and `distanceUnit`.
  Presets are `500m`, `1km`, `2km`, `5km`, `10km`, `15km`, `40km`, `80km`,
  `150km`, plus `other`.
- Legacy persisted/shared `type: "radius"` question payloads are normalized to
  `type: "radar"` on restore/import. Preserve this compatibility unless the
  app-state/wire version is intentionally bumped.
- Question map overlays should come from derived question render state before
  reaching `NativeMap`. Keep MapLibre layer ordering conservative, and avoid
  teaching `NativeMap` every future question family directly.

## Testing Expectations

For most code changes, run at least:

```bash
pnpm test
pnpm typecheck
```

For UI, state, or config changes, prefer the full:

```bash
pnpm check
```

For native accessibility, bottom-sheet, MapLibre, or app-start changes, run the
Maestro stack when the simulator/dev build is available:

```bash
pnpm test:e2e:ios:stack
```

Jest setup already mocks MapLibre, Gorhom bottom sheet, Reanimated,
AsyncStorage, and `expo-location` in `jest.setup.ts`. Extend those mocks in one
place instead of recreating ad hoc mocks in each test.

## React Native E2E and Accessibility

Maestro/XCUITest does not test the React component tree. It interacts with the
native iOS accessibility/view hierarchy, which can disagree with JSX, Jest
queries, and screenshots.

Keep these separate when debugging E2E:

- The React tree is what React Native Testing Library sees.
- The native view/accessibility tree is what Maestro and XCUITest see.
- A screenshot only proves pixels rendered; it does not prove the element is
  targetable by native automation.

Practical rules:

- If Maestro says an element is missing, inspect the debug hierarchy artifact,
  not just the screenshot.
- Put E2E selectors on stable native-accessible interaction targets.
- For iOS `TextInput`, especially when empty, a visible input may not expose the
  expected `testID`. If a visible control cannot be targeted by ID in Maestro,
  prefer a stable native-accessible parent; otherwise use carefully documented
  coordinate taps as a last resort. The current Play Area flow uses coordinate
  taps for the direct relation ID field and Apply button.
- Keep unit-test IDs and E2E IDs aligned in intent, but do not assume a Jest
  `getByTestId` pass guarantees Maestro can find the same node.
- Avoid unnecessary generic keyboard actions in Maestro. iOS number pads may not
  expose a standard dismiss action; if the next control is visible, tap it
  directly.
- If replacing text labels with icon-only buttons, provide stable
  accessibility labels and update both Jest and Maestro assertions together.

Accessibility lint is useful as a guardrail. It can catch missing labels, roles,
and bad accessibility prop usage, but it cannot prove that iOS exposes a
specific node through XCUITest. Use lint as the typecheck for the interaction
surface, and Maestro as the integration test for that surface.

## Current Sharp Edges

- The docs and E2E flows historically asserted visible map control text such as
  `Fit Tokyo 23 Wards` and `Locate me`. The current controls are icon-only, so
  keep Maestro focused on stable sheet rows and visible play-area state unless
  native-accessible labels are added to the map buttons.
- Photon and Overpass are live services. Keep happy-path unit tests independent
  of those networks, and reserve live checks for manual verification.
- Native dependency changes can require prebuild plus a dev-client rebuild even
  when TypeScript and Jest pass.
