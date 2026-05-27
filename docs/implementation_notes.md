# Mobile v2 Implementation Notes

## Milestone 2: Real Tokyo Map

Milestone 2 replaces the placeholder map with MapLibre RN and keeps the app dev-build-only. Expo Go will not work because `@maplibre/maplibre-react-native` is a native module.

Default play area is **Tokyo 23 Wards**, OSM relation `19631009`. The checked-in boundary fixture lives at `assets/default-zones/tokyo.json` and is loaded by `src/features/map/playArea.ts`. The old broader Tokyo prefecture relation `1543125` is intentionally not used because it includes the island chain and makes the initial bbox far too wide.

The map fit is intentionally biased upward. `NativeMap` calls `fitCameraToBbox` with `getTopViewportFitPadding`, which uses asymmetric MapLibre camera bounds padding so the bbox sits in the upper map area above the medium bottom sheet. If sheet snap points change, revisit `getTopViewportFitPadding` in `src/features/map/camera.ts`.

MapLibre native setup matters:

- `app.json` must include the `@maplibre/maplibre-react-native` plugin.
- `metro.config.js` pins `@maplibre/maplibre-react-native` to the workspace root to avoid duplicate native package resolution.
- After adding MapLibre, run `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo prebuild --platform ios --clean` so the iOS project gets the MapLibre Swift Package dependency and Podfile post-install hook.
- Rebuild the dev client after native dependency changes with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo run:ios --device "iPhone 16 Pro" --no-bundler`.

Testing added in this milestone:

- Jest config and mocks for MapLibre, Gorhom bottom sheet, Reanimated, and `expo-location`.
- Unit tests for play-area metadata/bbox, OSM style JSON, camera helpers, and user-location permission handling.
- Component tests for `NativeMap` and `MapAppScreen`.
- Maestro smoke flow at `e2e/smoke.yaml`.

E2E notes:

- Maestro is installed at `~/.maestro/bin/maestro`; add it to `PATH` if `maestro` is not found.
- Start Metro first: `pnpm exec expo start --dev-client --host localhost --port 8081 -c`.
- The smoke flow handles Expo dev-client first-run prompts conditionally, then asserts the map has loaded the default `Tokyo 23 Wards` label and the main settings row is targetable. The map controls are icon-only, so Maestro should not assert old visible copy such as `Fit Tokyo 23 Wards` or `Locate me`.
- GitHub Actions has a manually dispatchable `Maestro E2E` workflow. Agents can hand off device tests with `gh workflow run "Maestro E2E" --ref <branch> -f platform=android` or `platform=ios`, then follow it with `gh run watch`.
- The workflow also accepts `-f flow=smoke`, `play-area`, `hiding-zone`, `radar-question`, or `transit-line-question` for focused runs. Omit it, or pass `flow=all`, to run every Maestro flow.
- Android CI must enable KVM before `reactivecircus/android-emulator-runner`. If a run fails before `expo prebuild` with repeated `adb shell getprop sys.boot_completed`, a very slow boot time, and `adb` exit code 224 after `shell input keyevent 82`, suspect missing or broken VM acceleration rather than a Maestro flow failure.
- The e2e flows target the Expo app IDs from `app.json`: `com.raycatdev.hideandseek.v2` on both iOS and Android. If the bundle/package ID changes, update the Maestro `appId` headers together with `app.json`.

## Milestone 3: Play-Area Settings

Milestone 3 adds Settings → Play Area in the bottom sheet. The app still starts with Tokyo 23 Wards, but the current in-memory play area can now be changed by Photon relation search or by entering a direct OSM relation ID. The direct-ID acceptance path uses Osaka relation `358674`.

Fetched relation boundaries are loaded from Overpass using `out geom`, converted with `osmtogeojson`, filtered to polygonal geometry, and cached in AsyncStorage under relation-specific boundary keys. Osaka relation `358674` is also checked in at `assets/default-zones/osaka.json` as a bundled boundary so the direct-ID path and Maestro flow can run deterministically without depending on Overpass. The selected play area itself is not persisted yet; that remains part of the milestone 4 wire/persistence work.

Map rendering now reads from the mobile play-area provider instead of hard-coded Tokyo metadata, so the map label, boundary source, camera fit target, and Fit button follow the applied area.

Native/dependency setup matters:

- `@react-native-async-storage/async-storage` is a native dependency; after install/prebuild it must be present in the generated native project via autolinking.
- `osmtogeojson` is used in JS to convert Overpass responses into GeoJSON.
- `metro.config.js` pins AsyncStorage to the workspace root, matching the MapLibre/native-singleton pattern from milestone 2.
- Rebuild the dev client after adding AsyncStorage with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo run:ios --device "iPhone 16 Pro" --no-bundler`.

Bottom-sheet and E2E accessibility notes:

- The Play Area route snaps the bottom sheet to the large snap point before Maestro looks for controls.
- Maestro/XCUITest sees the native accessibility hierarchy, not the React tree. A visible empty `TextInput` may not expose its `testID` as a targetable iOS node.
- The direct relation ID field has React/Jest test IDs on both the wrapper and the inner text input, but the current Maestro flow uses visible coordinate taps because iOS does not expose those nested nodes reliably through XCUITest.
- The iOS number pad does not reliably support Maestro `hideKeyboard`. The play-area flow taps the visible Apply button directly after entering text.

E2E stack helper:

- `pnpm test:e2e:stack` runs `scripts/e2e-maestro-stack.mjs`, starts Metro on port 8081, runs all Maestro flows with debug artifacts under `e2e/artifacts/`, and shuts Metro down afterward. `pnpm test:e2e:ios:stack` remains as an iOS-named compatibility alias.
- The default-state Maestro flows call `clearState`, then open the Expo dev-client URL from `MAESTRO_DEV_CLIENT_URL`, dismiss the development-menu intro, and close the dev menu before app assertions. `scripts/e2e-maestro-stack.mjs` sets that URL to `10.0.2.2` on Linux/Android CI and `127.0.0.1` elsewhere; override `E2E_DEV_CLIENT_HOST` for local Android runs on macOS. This avoids depending on a plain Android `launchApp` for Expo dev-client startup while still preventing persisted AsyncStorage setup from leaking into default assertions. Add separate persistence-specific flows when testing relaunch behavior.
- The simulator must be booted/available before the stack run. The known working target is `iPhone 16 Pro - iOS 18.3`.

Testing added in this milestone:

- Boundary loading/cache unit tests for bundled Tokyo, mocked Osaka conversion, invalid IDs, and AsyncStorage cache hits.
- Photon result mapping tests for relation filtering and deduplication.
- Component tests for Settings → Play Area navigation, direct Osaka apply, invalid input, and fetch failure retaining Tokyo.
- Maestro flow at `e2e/play-area.yaml` that changes the play area to Osaka via relation `358674` and asserts the visible `Osaka` state change.

## Milestone 4: Hiding-Zone Presets

Milestone 4 adds Settings → Hiding Zones and map overlays for selected transit presets. The app now wraps the map and bottom sheet in both `PlayAreaProvider` and `HidingZoneProvider`; hiding-zone state is still in memory only.

Tokyo Metro and Toei Subway presets are generated from ODPT GTFS files. The refresh script and config live under `data/odpt/`:

- `config.yaml` defines source URLs and output paths.
- `scripts/fetch-odpt.mjs` reads `ODPT_KEY` from the environment or `~/.env`, downloads GTFS zips into ignored `data/odpt/cache/`, parses the relevant GTFS tables, and writes `generated/hiding-zone-presets.json`.
- `NOTICE.md` and `sources.md` carry ODPT/provider attribution, source links, and license/usage-rule notes. Keep these with any generated data changes.

Runtime behavior:

- Presets are suggested when the preset bbox intersects the current play-area bbox; suggestions are not auto-selected.
- Preset selection is additive. Selected stations are deduplicated by stable generated station IDs.
- Radius defaults to 600 meters. The UI can display meters, kilometers, or miles, but `HidingZoneProvider` stores meters internally.
- Distance unit conversion and compact display formatting live in `src/shared/distanceUnits.ts`. Hiding-zone modules keep backwards-compatible re-exports, but new cross-feature code should import the shared helpers and `DistanceUnit` type directly.
- `NativeMap` renders selected route lines, selected station points, and a merged hiding-zone fill generated with Turf circle/union helpers.

Testing added in this milestone:

- Unit tests for bbox suggestion logic, radius conversion, selected-station deduplication, and hiding-zone GeoJSON generation.
- Component tests for Hiding Zones navigation, Tokyo preset suggestions, preset selection, radius unit conversion, and map overlay layer rendering.

## Milestone 5 Questions

- Radar questions are preview-only. They persist in app state, render map circles, and expose the active question pin only while the question detail sheet is active.
- Pin movement is scoped by sheet state: leaving question detail or closing the sheet disables move-pin mode.
- Radar distance options are fixed presets (`500m`, `1km`, `2km`, `5km`, `10km`, `15km`, `40km`, `80km`, `150km`) plus `Other` for custom values.
- Radar custom distance and hiding-zone radius share `src/components/UnitSegmentedControl.tsx`, preserving the existing `hiding-zone-unit-*` and `radar-distance-unit-*` test IDs.
- The radar question info box compares the pin to selected hiding-zone stations; with no selected presets it shows an empty-state hint.
- Legacy persisted/shared `type: "radius"` questions are normalized to `type: "radar"` on import and restore.
- MapLibre Jest mocks now include `FillLayer` and `CircleLayer`.

Native/dependency setup matters:

- Hiding-zone geometry uses `@turf/circle`, `@turf/helpers`, and `@turf/union`.
- ODPT processing uses `fflate` for GTFS zip extraction and the built-in Node fetch API. Refreshing ODPT data requires network access and an `ODPT_KEY` for Tokyo Metro.
- `pnpm data:odpt` rewrites generated data. Run formatting afterward because generated JSON is checked in.
