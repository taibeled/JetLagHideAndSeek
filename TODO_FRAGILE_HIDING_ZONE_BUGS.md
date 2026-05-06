# TODO: Fragile Hiding Zone Bugs And Reliability Risks

This document lists likely fragile parts of the hiding-zone implementation, especially for mobile Safari, large custom station sets, browser process eviction, and reload from localStorage/cache.

Observed symptoms:

- Right panel does not open when the button is pressed.
- Green hiding zones show dots but no circles.
- Green hiding zones do not show up at all.
- The whole app freezes or becomes unresponsive.
- Mobile Safari may close/reload the page, then the app restores from persisted local state.

## 1. `isLoading` Can Cause Missed Hiding-Zone Rendering

File:

- `src/components/ZoneSidebar.tsx`

The hiding-zone compute effect sets `isLoading` to true, computes circles, then does:

```ts
hidingZoneData.set(runtimeData);
setStations(circles);
isLoading.set(false);
```

The separate render effect starts with:

```ts
if (!map || isLoading.get()) return;
```

Problem:

- `setStations(circles)` can trigger the render effect while `isLoading` is still true.
- The render effect returns early.
- `isLoading` is not subscribed with `useStore` inside that render effect's dependency list.
- When `isLoading.set(false)` runs, the render effect may not rerun.

Likely symptom:

- Hiding-zone computation completes, but no green circles are drawn.
- The right sidebar can appear to have station data while the map overlay is missing.

Potential fix:

- Set `isLoading.set(false)` before `setStations(circles)`, or better:
    - use local computation state for disabling controls,
    - subscribe to `$isLoading = useStore(isLoading)`,
    - include `$isLoading` in effect dependencies,
    - avoid reading global store state imperatively in effect guards.

Also consider splitting "map/question loading" from "hiding-zone loading" so one subsystem does not suppress another.

## 2. Errors Can Leave `isLoading` Stuck True

File:

- `src/components/ZoneSidebar.tsx`

The `initializeHidingZones().catch(...)` branch shows a toast but does not reset `isLoading`.

Problem:

- If any Turf, Overpass, custom station, or Leaflet-prep step throws after `isLoading.set(true)`, the app can remain globally loading.
- Many buttons are disabled from `isLoading`.
- Effects guarded by `isLoading.get()` will keep returning early.

Likely symptoms:

- Sidebars/buttons appear unresponsive.
- Hiding zones stop updating.
- User can get stuck after a single failed compute.

Potential fix:

- Wrap `initializeHidingZones` body in `try/finally`.
- Always clear hiding-zone-specific loading state in `finally`.
- Avoid global `isLoading` for long-running hiding-zone work.

Example shape:

```ts
const initializeHidingZones = async () => {
    hidingZoneLoading.set(true);
    try {
        // compute
    } finally {
        hidingZoneLoading.set(false);
    }
};
```

## 3. No Cancellation Or Generation Guard In Hiding-Zone Computation

File:

- `src/components/ZoneSidebar.tsx`

`Map.tsx` has `mapRefreshGeneration` to discard stale map computations. The hiding-zone effect does not have an equivalent guard.

Problem:

- A slow hiding-zone computation can finish after newer inputs have arrived.
- The stale result can overwrite `hidingZoneData` and `trainStations`.
- Multiple rapid store updates can create overlapping async work.

Likely symptoms:

- Erratic station counts.
- Hiding zones drawn for previous settings.
- Dots/circles not matching current radius, display style, station source, or questions.

Potential fix:

- Add `hidingZoneRefreshGeneration`.
- Capture generation at compute start.
- Check before writing `hidingZoneData`, `trainStations`, `transitGraph`, and map layers.
- If work is chunked/workerized later, make cancellation explicit.

## 4. Heavy Turf Work Blocks The Main Thread

File:

- `src/components/ZoneSidebar.tsx`

The hot path includes:

- `safeUnion(...)`
- `turf.simplify(...)`
- `turf.difference(...)`
- `turf.circle(...)` for every candidate station
- `turf.booleanIntersects(...)` for every generated circle
- optional `turf.nearestPoint(...)` and brand/POI checks for certain question types

Problem:

- This all runs on the main browser thread.
- With ~500 stations, `turf.circle(... steps: 32 ...)` creates roughly 16,000 circle vertices before rendering.
- Mobile Safari is especially sensitive to long main-thread blocks and memory spikes.

Likely symptoms:

- Taps do not register.
- Right panel button appears broken.
- Whole app freezes.
- Safari kills or reloads the tab.

Potential fixes:

- BBox prefilter before circle creation.
- Chunk station processing across frames.
- Move computation to a Web Worker.
- Render using Leaflet `Circle` where exact polygons are not required.
- Reduce circle fidelity on mobile/large station counts.

## 5. Leaflet GeoJSON Rendering Is Too Heavy For Hundreds Of Circles

File:

- `src/components/ZoneSidebar.tsx`

`showGeoJSON(...)` passes all station circles to `L.geoJSON(...)`.

Problem:

- Hundreds of polygon circles become hundreds of SVG/vector paths.
- Each circle has many coordinates.
- Popups and feature hooks add more Leaflet objects.
- Mobile Safari can run out of memory or spend too long painting.

Likely symptoms:

- Dots render but circles do not.
- Map becomes sluggish.
- Overlay disappears after a reload or style change.
- Browser tab reloads.

Potential fixes:

- Render `zones` mode using Leaflet `Circle` from station points.
- Render only current viewport circles.
- Use lower circle fidelity.
- Fall back to `stations` mode above a mobile threshold.
- Avoid rendering all circles immediately after reload.

## 6. `no-overlap` Display Mode Is Especially Risky

File:

- `src/components/ZoneSidebar.tsx`

`styleStations(..., "no-overlap")` calls:

```ts
safeUnion(turf.featureCollection(circles));
```

Problem:

- Unioning hundreds of overlapping polygons is expensive and failure-prone.
- It can create very complex output geometry.
- It can block the main thread or throw topology errors.

Likely symptoms:

- App freezes when changing display style.
- Green zones vanish after selecting no-overlap.
- Safari reloads the page.

Potential fixes:

- Compute `no-overlap` lazily and only on explicit user request.
- Disable/warn above a threshold.
- Use lower-fidelity circles for union.
- Move union to a worker.
- Cache union result by active station ids/radius.

## 7. Large Derived Geometry Is Stored In App State

Files:

- `src/lib/context.ts`
- `src/lib/hidingZoneRuntimeData.ts`
- `src/components/ZoneSidebar.tsx`

`hidingZoneData` contains full `stationCircles`, and each station circle is a full GeoJSON polygon.

Problem:

- Large derived geometry is retained in memory.
- `hidingZoneData` participates in the computed `hidingZone` share payload.
- `buildHidingZoneRuntimeData` uses `structuredClone`.
- Reusing cached data uses another `structuredClone`.

Likely symptoms:

- Memory spikes after compute.
- Reload from cached/share state is expensive.
- Mobile Safari kills/reloads the tab.

Potential fixes:

- Store station points and radius metadata instead of full circles.
- Store active station ids rather than full derived polygons.
- Recompute display geometry lazily.
- Omit or threshold derived `hidingZoneData` from share/live-sync payloads.

## 8. Live Sync Serializes Huge Hiding-Zone Payloads

Files:

- `src/lib/context.ts`
- `src/lib/liveSync.ts`
- `src/lib/wire.ts`

`hidingZone` includes `hidingZoneData`, then live sync does:

```ts
const wire = buildWireV1Envelope(cloneForWire(hz));
const canonicalUtf8 = canonicalize(wire);
const sid = await computeSidFromCanonicalUtf8(canonicalUtf8);
const compressed = await compress(canonicalUtf8);
```

Problem:

- `cloneForWire`, `canonicalize`, and compression walk a potentially huge object.
- This happens after state changes and can run on the main thread.
- Hundreds of station circles make the payload much larger than the user's actual authored data.

Likely symptoms:

- UI freezes after hiding-zone computation appears complete.
- App is responsive until live sync kicks in.
- Mobile Safari reloads due to memory pressure.

Potential fixes:

- Exclude full derived circle geometry from live-sync payload.
- Only sync inputs: custom stations, source settings, questions, radius, display options.
- Include compact runtime data only below a byte/feature threshold.
- Schedule heavy canonicalization in idle time or a worker.

## 9. Reload From LocalStorage Can Re-Enter The Failure Loop

Files:

- `src/lib/context.ts`
- `src/components/ZoneSidebar.tsx`

These stores persist:

- `displayHidingZones`
- `displayHidingZonesOptions`
- `displayHidingZoneOperators`
- `displayHidingZonesStyle`
- `customStations`
- `hidingRadius`
- `hidingRadiusUnits`
- `polyGeoJSON`

Problem:

- If Safari reloads after a memory/CPU failure, the app restores the same expensive settings.
- Once `questionFinishedMapData` becomes available, hiding-zone computation can immediately run again.
- This can trap users in a reload/freeze cycle.

Likely symptoms:

- App opens and quickly freezes again.
- User cannot reach options/sidebar quickly enough to disable hiding zones.

Potential fixes:

- Detect previous crash/reload during hiding-zone compute.
- On next load, temporarily disable `displayHidingZones` or switch to `stations` mode.
- Add a "safe mode" URL param or localStorage recovery flag.
- Defer hiding-zone computation until after first user interaction on mobile if station count is large.

## 10. `displayHidingZonesStyle` Persistence Can Explain Dots-Only State

File:

- `src/lib/context.ts`
- `src/components/ZoneSidebar.tsx`

`displayHidingZonesStyle` persists independently and supports:

- `zones`
- `stations`
- `no-overlap`
- `no-display`

Problem:

- After reload, the app may legitimately restore `stations`, which shows green station dots without circles.
- Users may interpret this as a rendering failure if the UI state is hidden in the right sidebar.

Likely symptom:

- "Green hiding zone shown with dots but no circles."

Potential fixes:

- Make active display style more visible.
- Reset from dangerous styles after crash/reload.
- Add a quick map-side style toggle or status badge.

## 11. Shared Global `isLoading` Couples Unrelated Subsystems

Files:

- `src/lib/context.ts`
- `src/components/Map.tsx`
- `src/components/ZoneSidebar.tsx`
- question cards/sidebar components

Problem:

- The same `isLoading` is used for map refreshes, hiding-zone work, Overpass work, and UI disabling.
- A long hiding-zone computation disables question actions and can suppress unrelated effects.
- A map refresh can block zone rendering.

Likely symptoms:

- Right panel or controls feel randomly disabled.
- One subsystem failure makes the whole app feel broken.

Potential fixes:

- Split into separate loading states:
    - `mapLoading`
    - `hidingZoneLoading`
    - `overpassLoading`
    - `shareLoading`
- Use derived UI disable state only where needed.

## 12. Rendering Effect Reads Stores Imperatively

File:

- `src/components/ZoneSidebar.tsx`

Some effects read state with `isLoading.get()` or `questions.get()` instead of subscribing via `useStore` and dependencies.

Problem:

- Effects may not rerun when those store values change.
- Render/update behavior depends on incidental rerenders from other stores.

Likely symptoms:

- Stale hiding-zone layers.
- Missing redraw after loading finishes.
- Question filters not applied until another unrelated interaction.

Potential fixes:

- Prefer `const $isLoading = useStore(isLoading)` and include it in dependencies where it controls effect behavior.
- Capture question snapshots at compute start.
- Use generation guards for async work.

## 13. Station Circle Property Shape Is Fragile

Files:

- `src/components/ZoneSidebar.tsx`
- `src/lib/context.ts`
- question cards using `trainStations`

Current nested shape often requires:

```ts
circle.properties.properties.id;
```

Problem:

- Full station feature is nested inside circle properties.
- Imported/custom/Overpass stations may not have identical property shapes.
- Any partial/corrupt cached data can cause runtime errors.

Likely symptoms:

- Invalid station selected.
- Disabled station filtering throws or silently fails.
- List and map overlay disagree.

Potential fixes:

- Normalize to a flat internal `StationCandidate` type.
- Keep original OSM feature under `sourceFeature` if needed.
- Validate or repair cached `hidingZoneData` on load.

## 14. `sourceInputsMatch` Canonicalizes Potentially Large Inputs

File:

- `src/lib/hidingZoneRuntimeData.ts`

`sourceInputsMatch` compares:

```ts
canonicalize(a) === canonicalize(b);
```

Problem:

- `sourceInputs` includes `customStations` and questions.
- With large custom station sets, canonicalizing every relevant effect run may be expensive.

Likely symptoms:

- UI jank before any visible hiding-zone work starts.

Potential fixes:

- Compute stable hashes incrementally.
- Compare cheap version counters.
- Store a precomputed `sourceInputsHash` with runtime data.
- Avoid including large unchanged arrays directly in every comparison.

## 15. Transit Graph Work May Be Unnecessary For Custom-Only Lists

File:

- `src/components/ZoneSidebar.tsx`

The current code skips transit graph building when `useCustomStations && !includeDefaultStations`, which is good.

Risk:

- In mixed default+custom mode or large default station sets, `buildTransitGraphForStations(...)` can add another expensive async step.

Potential fixes:

- Only build transit graph if any active question needs same-train-line behavior.
- Cache transit graph separately from display circles.
- Move graph work to a worker or lazy path.

## 16. Brand/POI Station Question Filters Can Add More Network And Geometry Work

File:

- `src/components/ZoneSidebar.tsx`

For `mcdonalds` and `seven11` measuring questions, the zone pipeline calls `findPlacesSpecificInZone(...)`, then computes nearest points for each station.

Problem:

- More Overpass/network/cache work happens inside the station filter loop.
- `turf.nearestPoint` is repeated per station.

Potential fixes:

- Build a spatial index for brand/POI points.
- Cache brand/POI points by play area and question type.
- Apply bbox/distance prefilters.

## 17. Need Mobile-Specific Recovery And Guardrails

Problem:

- Mobile Safari has stricter memory and CPU behavior than desktop browsers.
- A pipeline that is technically correct can still be unusable at 500 stations.

Potential guardrails:

- If station count exceeds threshold on mobile:
    - default to `stations` display,
    - delay circle rendering,
    - lower circle steps,
    - show a warning,
    - allow manual "render full circles" action.
- If a previous hiding-zone compute did not complete cleanly:
    - start next load with hiding zones disabled,
    - or start in safe `stations` mode.

## Suggested Fix Priority

1. Add `try/finally` so hiding-zone loading always clears.
2. Fix effect ordering so `setStations` cannot trigger a skipped render while loading is still true.
3. Add a generation guard/cancellation check for hiding-zone computations.
4. Add bbox prefilter before circle creation/intersection.
5. Stop storing/syncing full circle geometry where possible.
6. Render `zones` with Leaflet circles or viewport-only circles.
7. Add large-station mobile guardrails.
8. Workerize or chunk remaining Turf work.
