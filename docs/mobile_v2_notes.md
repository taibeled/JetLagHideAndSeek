> **Historical planning document.** The `mobile_v2/` app has been promoted to the
> repository root. Commands and paths in this document reflect the original
> monorepo structure and may not match the current layout.

I’d do this as a **mobile app rewrite, not a mobile app port**.

The current `mobile` branch already has a serious Expo/React Native app scaffold: Expo Router, React Native 0.81, MapLibre RN, Gorhom bottom sheet, AsyncStorage, NativeWind, Sentry/PostHog, and Nanostores are already wired in. It also already made the important native choice: **MapLibre RN**, which means Expo Go will not work; you need a dev build via `expo run:ios` / `expo run:android`.

So the best route is:

> **Create a clean Expo SDK 54 `mobile_v2/` app, then selectively borrow proven native/project plumbing and shared geometry from the existing mobile branch while rewriting the app surface and state shape around an Apple Maps-style bottom-sheet app.**

### Do not repeat these mistakes

1. **Do not run Expo native commands from the monorepo root.**
   Run from `mobile_v2/`, or use `pnpm --dir mobile_v2 ...`. Running from the wrong package can make Expo look for a root `App` file or generate accidental root-level `ios/` and `app.json` files.

2. **Do not keep generated native files from the wrong SDK.**
   If the SDK changes before the first real commit, delete/regenerate the native project cleanly:

    ```bash
    cd mobile_v2
    LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo prebuild --platform ios --clean
    ```

3. **Avoid nested duplicate native packages in Metro.**
   If using pnpm hoisting, add a `metro.config.js` early that pins native singletons (`react`, `react-dom`, `react-native`, `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-reanimated`) to the workspace root and disables hierarchical lookup. This should be a safety net, not a substitute for clean SDK 54 scaffolding.

## The mental model

Your notes describe the right mobile shape: **map as the persistent canvas, bottom drawer as the app**, with a main drawer, stacked question/settings drawers, and copy/paste modals. That is much more mobile-native than trying to shrink the web app’s left/right sidebars.

The existing web app is an Astro shell with React islands, Nanostores, Leaflet, and sidebars. Its flow is basically: user edits Nanostores, `Map.tsx` recomputes Leaflet layers, then sidebars react to final map data. That architecture is useful to understand, but the **view/controller layer should not be copied**.

## What I would keep

Keep these from the mobile branch:

1. **Expo app setup**
   Use `mobile/package.json`, `app.json`, `metro.config.js`, NativeWind, MapLibre, AsyncStorage, and Expo Router as references, not as files to copy blindly. The mobile branch has already solved a bunch of painful native setup. `metro.config.js` is especially valuable because it watches the monorepo root, resolves shared `src/`, handles the `@/` alias, stubs ArcGIS, and redirects shared cache imports to mobile cache code. In `mobile_v2`, recreate only the pieces needed for the current milestone and keep SDK 54 versions consistent.

2. **MapLibre choice**
   Do not use Leaflet-in-WebView for this version. MapLibre RN is the right choice for “idiomatic app patterns,” native map gestures, native layers, and Apple Maps-like UI.

3. **Pure game/domain logic**
   Reuse `src/maps/schema.ts`, the question schemas, and the pure geometry functions under `src/maps/`. The old app already separates most map math into `src/maps`, with question families like radar, thermometer, tentacles, matching, and measuring.

4. **Mobile storage lessons**
   The mobile branch’s AsyncStorage/Nanostores bridge is worth keeping or learning from. It configures `@nanostores/persistent` before importing atoms, mirrors AsyncStorage into memory, and exposes `storageReady` so first render sees persisted values. The root layout already waits for `storageReady` before rendering.

5. **Map layer ordering and coordinate rules**
   The mobile branch notes are important: MapLibre uses `[longitude, latitude]`, while some legacy stores use `[latitude, longitude]`; also, `ShapeSource`/layers must come before `MarkerView` siblings or MapLibre RN can silently drop sources.

## What I would rewrite

Rewrite these from scratch:

1. **`AppMapView`**
   The current mobile entry point just renders `AppMapView`. But `AppMapView` currently owns map refs, sheet visibility, settings visibility, question editing, custom POI mode, polygon drawing, pick-location state, hiding-zone prompts, and layer orchestration. That is too much controller logic in one screen for the clean version.

2. **`QuestionsPanel`, `MapConfigPanel`, `SettingsSheet`**
   Treat these as references, not imports. They probably encode useful behavior, but they are not the Apple Maps-style information architecture you want.

3. **Mobile state shape**
   Do not blindly re-export the entire web `src/lib/context.ts` into mobile. The current mobile branch does that after installing its AsyncStorage engine. It is pragmatic, but not clean. For the rewrite, define a mobile-first app state and create adapters into shared geometry code.

## Target architecture

I’d structure the clean app like this:

```text
mobile_v2/
  app/
    _layout.tsx
    index.tsx

  src/
    screens/
      MapAppScreen.tsx

    state/
      appStore.ts
      sheetStore.ts
      questionStore.ts
      playAreaStore.ts
      settingsStore.ts

    wire/
      schema.ts
      encode.ts
      decode.ts
      migrations.ts

    features/
      map/
        NativeMap.tsx
        MapLayers.tsx
        MapControls.tsx
        useMapCameraPadding.ts
        useUserLocation.ts

      sheet/
        AppBottomSheet.tsx
        SheetNavigator.tsx
        MainDrawer.tsx

      questions/
        QuestionListScreen.tsx
        AddQuestionModal.tsx
        QuestionDetailScreen.tsx
        editors/
          RadarEditor.tsx
          ThermometerEditor.tsx
          TentaclesEditor.tsx
          MatchingEditor.tsx
          MeasuringEditor.tsx

      play-area/
        PlayAreaScreen.tsx
        PresetsScreen.tsx
        TransitOperatorsScreen.tsx

      settings/
        SettingsScreen.tsx
        UiSettingsScreen.tsx
        CopyPasteModal.tsx

    domain/
      computeMapState.ts
      questionAdapters.ts
      coordinate.ts
      units.ts
```

The important shift is that the map screen should become a coordinator, not the owner of every app mode.

## App shell: copy Apple Maps

Use one persistent `BottomSheet` as the main interaction surface.

Recommended sheet routes:

```ts
type SheetRoute =
    | { name: "main" }
    | { name: "questions" }
    | { name: "question-detail"; questionKey: number }
    | { name: "add-question" }
    | { name: "settings" }
    | { name: "play-area" }
    | { name: "ui-settings" }
    | { name: "copy-paste" };
```

Then your bottom sheet acts like a little navigation stack:

```text
Main Drawer
  → Questions
      → Question Detail
  → Add Question
      → Question Detail
  → Settings
      → Play Area
      → UI Settings
      → Copy/Paste State
```

Use snap points like:

```ts
const snapPoints = ["18%", "42%", "88%"];
```

The Apple Maps trick is that the map is never “behind a modal” unless absolutely necessary. Most actions happen in the sheet while the map remains visible. For example:

```text
Question Detail
  compact: question title + answer summary
  medium: main fields
  large: advanced controls / delete / debug geometry
```

When editing a location, do not use a form-only picker. Use a mode:

```text
Question Detail → "Pick on map"
  sheet collapses
  top banner: "Tap map to set location"
  user taps map
  banner shows confirm
  sheet reopens to same question
```

The current mobile branch already has a version of this pick-mode flow, but I’d reimplement it as a reusable state machine rather than embedding it in the root map component.

## Data model first

Before building lots of UI, define the canonical state. Your notes already identify the right top-level wire chunks: play area, UI settings, question state, and a special “new question” payload.

I’d make the mobile internal state close to the wire format:

```ts
type AppStateV1 = {
    version: 1;
    playArea: {
        source:
            | { kind: "osm-relation"; osmId: number; label?: string }
            | { kind: "custom-polygon"; geojson: GeoJSON.FeatureCollection };
        bbox?: [number, number, number, number]; // [west, south, east, north]
        polygon?: GeoJSON.FeatureCollection;
        presets: TransitPreset[];
        transitOperators: TransitOperatorFilter[];
    };

    ui: {
        units: "m" | "km" | "mi";
        thunderforestApiKey?: string;
        thunderforestEnabled: boolean;
        hiderMode: boolean;
    };

    questions: QuestionState[];

    metadata: {
        createdAt: string;
        updatedAt: string;
    };
};
```

Then define a separate envelope for the special “new question” sharing case:

```ts
type WireEnvelope =
    | {
          kind: "app-state";
          version: 1;
          payload: AppStateV1;
      }
    | {
          kind: "new-question";
          version: 1;
          payload: QuestionState;
      };
```

Use Zod for both. Do not rely on “whatever JSON happens to parse.” The existing app already uses Zod for question schema, so this fits the project’s current style.

Also: store all distances internally in meters, even if the UI displays miles/km. Your note already says that is the desired default.

## Build order

I would do this in small PRs/milestones.

### Milestone 1: empty native shell

Goal: learn RN layout, safe areas, Expo dev build, and bottom sheets.

Start from a clean Expo SDK 54 scaffold in `mobile_v2/`. Do not copy the current `mobile/` app wholesale, and do not scaffold SDK 55 and downgrade. Replace the generated starter screen with:

```text
MapAppScreen
  NativeMap placeholder
  AppBottomSheet
    MainDrawer
```

Main drawer only has:

```text
Questions
Add Question
Settings
```

No real game logic yet.

Milestone 1 implementation checklist:

```text
1. Scaffold SDK 54 cleanly.
2. Add mobile_v2 to pnpm-workspace.yaml.
3. Install dependencies from the monorepo root.
4. Add @gorhom/bottom-sheet and expo-dev-client using Expo/SDK-54-compatible versions.
5. Replace generated starter routes/components with the shell.
6. Add a Metro singleton config if pnpm creates nested native package copies.
7. Verify:
   pnpm --dir mobile_v2 exec expo config --type public
   pnpm --dir mobile_v2 exec tsc --noEmit
   pnpm --dir mobile_v2 lint
8. For iOS simulator:
   cd mobile_v2
   LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo run:ios --simulator "iPhone 16"
9. For physical iOS device:
   cd mobile_v2
   LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo run:ios --device
   pnpm exec expo start --dev-client -c
```

### Milestone 2: real map, no questions

Add MapLibre with:

```text
- base tiles
- user location button
- current play-area boundary
- camera fit-to-play-area
```

Do not add elimination logic yet. Get comfortable with MapLibre sources/layers first.

### Milestone 3: play-area settings

Implement:

```text
Settings → Play Area
  OSM ID / search result
  bbox display
  polygon cache
  known presets
```

Reuse or wrap `fetchZoneBoundary.ts` from the mobile branch if it works. Keep the UI new.

### Milestone 4: wire format + persistence

Implement:

```text
- AppStateV1 Zod schema
- encode/decode
- migration placeholder
- AsyncStorage persistence
- Copy/Paste modal
```

Do this before complex question editing. It forces you to make the app state clean.

### Milestone 5: questions list + add-question flow

Implement the bottom-sheet UX without geometry first:

```text
Questions
  list existing questions
  tap → question detail

Add Question
  choose type
  creates draft
  opens Question Detail
```

Do radar first. Then thermometer. Then the others.

### Milestone 6: map-pick mode

Add the interaction you’ll use constantly:

```text
Question Detail → Pick on map
  collapse sheet
  tap map
  confirm banner
  update draft/question
  return to detail sheet
```

This is one of the core mobile UX wins over the web app.

### Milestone 7: elimination layers

Only now pull in the heavy geometry.

Create a pure function:

```ts
function computeMapRenderState(appState: AppStateV1): MapRenderState;
```

Then a hook:

```ts
function useMapRenderState() {
    const appState = useAppState();
    return useMemo(() => computeMapRenderState(appState), [appState]);
}
```

The goal is to avoid hiding game logic in React component effects. The existing web app’s `Map.tsx` became both view and controller; your clean app should not repeat that.

### Milestone 8: hider mode and “new question” wire

Add:

```text
Settings → Hider mode
Copy/Paste → app-state or new-question
Add Question → paste incoming new-question
```

This gives you the seeker/hider sharing path in a mobile-native way.

## State management recommendation

Use **Nanostores only if you want maximum reuse with the existing app**.

For learning React Native cleanly, I’d actually do:

```text
domain state: Zustand or small reducer store
wire schema: Zod
persistence: AsyncStorage
legacy adapter: functions that convert to/from old question schema
```

But because the existing project already uses Nanostores heavily, the pragmatic compromise is:

```text
Use Nanostores for persisted domain state.
Do not import the entire legacy context.
Create mobile-specific atoms:
  playAreaAtom
  uiSettingsAtom
  questionsAtom
  sheetStackAtom
```

Avoid this pattern:

```ts
// bad for clean mobile
import { everything } from "../../src/lib/context";
```

Prefer:

```ts
// better
import { questionSchema } from "../../src/maps/schema";
import { applyQuestionsToMapGeoData } from "../../src/maps";
```

That keeps the mobile app from inheriting web concepts like Leaflet context, sidebars, browser localStorage assumptions, and old controller flows.

## Bottom-sheet details

Use `@gorhom/bottom-sheet`, since it is already in the branch. The branch notes call out an important gotcha: with v5, if using fixed snap points, set `enableDynamicSizing={false}` to avoid weird near-zero snap behavior.

Use one of these patterns:

```tsx
<BottomSheet snapPoints={["18%", "42%", "88%"]} enableDynamicSizing={false}>
    <SheetNavigator />
</BottomSheet>
```

For modals like copy/paste or add-question type chooser, use either:

```text
BottomSheetModal
```

or a route inside the same sheet. I’d use same-sheet routes first, then modal only for destructive confirmations or paste/import review.

## What “pulling in components” should mean

Do **not** pull old components wholesale unless they are already pure.

Good candidates to reuse directly or almost directly:

```text
mobile/lib/storage.ts
mobile/lib/cache.ts
mobile/lib/fetchZoneBoundary.ts
mobile/lib/overpassFetch.ts
mobile/hooks/useUserLocation.ts, maybe
src/maps/schema.ts
src/maps/questions/*
src/maps/geo-utils/*
```

Use as reference, but rewrite:

```text
mobile/components/MapView.tsx
mobile/components/QuestionsPanel.tsx
mobile/components/MapConfigPanel.tsx
mobile/components/SettingsSheet.tsx
mobile/hooks/useEliminationMask.ts
```

`useEliminationMask` may contain useful mobile-specific geometry adaptation, but I’d move the core computation into a pure function and make the hook tiny.

## A good first implementation target

Your first “real” vertical slice should be:

```text
1. App opens to full-screen MapLibre map
2. Bottom sheet at compact snap point
3. Main drawer has Questions / Add Question / Settings
4. Settings can set one play area
5. Add Question can create a radar question
6. Question Detail can pick center on map
7. Radar renders on map
8. App state can copy/paste as JSON
```

That single slice teaches:

```text
Expo dev builds
RN layout
MapLibre layers
bottom sheets
safe areas
AsyncStorage
Zod schemas
map-pick interactions
shared geometry adapters
```

And it avoids drowning in all five question types at once.

## The main warning

The existing mobile branch is useful, but it has already grown in the direction you are trying to avoid: one root map screen coordinating many modes, panels, hooks, and side effects. The clean rewrite should make the **bottom sheet navigation** the app’s controller, and the map should mostly render derived state.

In one sentence:

> Keep the mobile branch’s native scaffolding and shared geometry, but build a new mobile-first app around `AppStateV1 → derived map layers → Apple Maps-style bottom-sheet routes`.
