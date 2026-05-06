# TODO: Hiding Zone Optimization Ideas

This document collects potential optimizations for the hiding-zone station pipeline, especially for mobile Safari and large custom station sets such as ~500 stations.

The current pipeline eagerly turns candidate stations into Turf polygon circles, filters those polygons against the solved play area, stores the resulting circles, and renders them as GeoJSON. That is correct enough for many cases, but it puts a lot of synchronous geometry, cloning, serialization, and SVG rendering pressure on the main browser thread.

## Current Hot Path

Relevant files:

- `src/components/ZoneSidebar.tsx`
- `src/lib/context.ts`
- `src/lib/hidingZoneRuntimeData.ts`
- `src/lib/liveSync.ts`
- `src/maps/api/overpass.ts`
- `src/maps/geo-utils/*`

High-level current flow:

1. `Map.tsx` computes `questionFinishedMapData`.
2. `ZoneSidebar` sees `displayHidingZones === true` and `questionFinishedMapData`.
3. It obtains candidate stations from either Overpass or custom station imports.
4. It optionally filters operators and merges duplicates.
5. It reconstructs the playable zone from the holed eliminated mask.
6. It creates a Turf polygon circle for every station.
7. It tests each circle against the playable zone.
8. It applies station-specific question filters.
9. It stores full `StationCircle[]` in `hidingZoneData` and `trainStations`.
10. It renders circles or points through Leaflet GeoJSON.

## 1. Add BBox First-Pass Filtering

Use cheap bounding-box checks before generating full Turf circles or calling `turf.booleanIntersects`.

Current expensive shape:

```ts
const circle = turf.circle(center, radius, {
    steps: 32,
    units: $hidingRadiusUnits,
    properties: place,
});

return turf.booleanIntersects(circle, playableZone);
```

Better shape:

```text
station point + radius
  -> approximate station radius bbox
  -> compare with playable bbox
  -> only then create Turf circle
  -> only then exact intersection
```

Implementation sketch:

```ts
function radiusBbox(
    [lng, lat]: [number, number],
    radiusKm: number,
): [number, number, number, number] {
    const latDelta = radiusKm / 111.32;
    const lngDelta =
        radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

    return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
}

function bboxesOverlap(
    a: [number, number, number, number],
    b: [number, number, number, number],
) {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
```

Important caveat:

- BBox filtering should only reject candidates.
- If bboxes overlap, still run the exact Turf intersection unless a later optimization deliberately accepts approximate behavior.
- Make the bbox slightly generous to avoid false negatives.

Expected benefit:

- Large when the solved playable area is much smaller than the full station set.
- Low implementation risk.
- Does not solve cases where almost all stations are near the playable area.

## 2. Store Stations As Points + Radius Metadata

Avoid eagerly storing full polygon circles as canonical runtime state.

Current state shape:

```text
hidingZoneData.stationCircles:
  full GeoJSON polygon circles
```

Suggested state shape:

```text
station candidates:
  id
  name
  lng
  lat
  source tags
  precomputed radius bbox
  active / disabled state
```

Then derive display geometry only when needed.

Benefits:

- Much smaller `hidingZoneData`.
- Less `structuredClone`.
- Less `canonicalize`.
- Less live-sync compression work.
- Less memory retained after reload.
- Easier to render with Leaflet `Circle`.

Tradeoff:

- Some existing code expects `StationCircle` and nested `circle.properties.properties.id`.
- This needs a compatibility layer or gradual migration.

## 3. Render Normal Zone Display With Leaflet Circle

For `displayHidingZonesStyle === "zones"`, exact GeoJSON polygon circles may not be necessary. Leaflet can render `L.Circle`/React Leaflet `Circle` from point + radius.

Current:

```text
StationCircle polygon
  -> FeatureCollection
  -> L.geoJSON
  -> many SVG polygon paths
```

Possible:

```text
Station point + radius
  -> Leaflet Circle
```

Benefits:

- Avoids generating polygon coordinates for display.
- Avoids rendering hundreds of large GeoJSON polygon features.
- Keeps display responsive when the user only needs visual station radii.

Keep Turf polygons for:

- Exact intersection filtering if still needed.
- `no-overlap` union mode.
- selected-station detailed geometry.
- export/print modes where exact polygon output matters.

Potential caution:

- Leaflet circles are projected screen/map objects, not serialized GeoJSON polygon geometry.
- The visual may differ slightly from Turf geodesic circles, especially at larger radii or high latitudes.

## 4. Use Progressive Fidelity For Circles

The current circle generation uses `steps: 32`.

Potential policies:

- 8 steps on mobile or while interacting.
- 16 steps for normal large station sets.
- 32 steps only for exact/export/print modes.
- Use a slightly generous radius for low-fidelity filtering to avoid false negatives.

Possible heuristic:

```text
if station count > 300 -> 8 or 12 steps
if station count > 100 -> 16 steps
else -> 32 steps
```

Benefits:

- Reduces vertices and intersection cost.
- Reduces Leaflet SVG path complexity.

Caution:

- Lower-fidelity polygons can introduce false negatives if used for exact filtering.
- Prefer using lower fidelity only as a prefilter, or inflate radius slightly.

## 5. Chunk Heavy Work Across Frames

Even if the total computation stays the same, chunking can prevent the UI from appearing frozen.

Current behavior:

```text
process all stations synchronously
then render
```

Better behavior:

```text
process 25 stations
yield to browser
process next 25
yield
...
```

Possible tools:

- `requestIdleCallback` where available.
- `requestAnimationFrame`.
- `setTimeout(..., 0)` fallback.

Benefits:

- Sidebar taps can register.
- Safari can paint intermediate UI.
- The page is less likely to be killed for appearing stuck.

Caution:

- Needs cancellation/generation guards so stale chunks do not overwrite newer state.
- Needs progress/loading state that accurately reflects partial work.

## 6. Move Hiding-Zone Computation To A Web Worker

The cleanest long-term fix is to move Turf-heavy station filtering off the main thread.

Main thread sends:

```text
station points
radius
units
playable geometry
operator/question filters
mode settings
```

Worker returns:

```text
active station ids
optional lightweight display geometry
warnings/errors
```

Benefits:

- UI remains responsive during heavy Turf work.
- Directly addresses "right panel does not open" and "whole app freezes."
- Makes cancellation/generation IDs cleaner.

Caution:

- GeoJSON payloads copied to/from workers can still be large.
- Use transferable/compact data where possible.
- Keep returned data small: ids or point records before returning full polygons.

## 7. Add Spatial Indexing

Use a spatial index such as `rbush` or `flatbush` to index station radius bboxes.

Potential flow:

1. Build bbox for each station radius.
2. Insert station bboxes into an R-tree.
3. Query by playable bbox or by component polygon bboxes.
4. Run exact Turf checks only for returned candidates.

Benefits:

- Useful for repeated recomputes when questions change.
- Useful when many stations are far outside the solved area.

Caution:

- Index build cost may not pay off for small station counts.
- Store/index points and bboxes, not full circles.

## 8. Split Playable Geometry Into Indexed Parts

Instead of testing every station circle against one large playable `MultiPolygon`, flatten the playable geometry into smaller parts and use bbox checks per part.

Possible flow:

```text
playable geometry
  -> flatten polygons
  -> bbox per polygon
  -> station bbox overlaps any polygon bbox?
  -> exact intersection only then
```

Benefits:

- Avoids expensive checks against large complex polygons when only a few pieces matter.
- Works well with custom polygons and fragmented solution areas.

Caution:

- More implementation complexity.
- Need careful handling of holes and `MultiPolygon` geometries.

## 9. Distance-To-Playable Shortcuts

Before generating a full circle:

1. If station center is inside playable zone, keep it immediately.
2. Else if distance from station center to playable boundary is greater than hiding radius, reject.
3. Else generate circle and run exact intersection.

Benefits:

- Avoids circles for stations clearly inside or clearly far away.

Caution:

- Turf distance-to-polygon-boundary helpers can themselves be expensive.
- Needs benchmarking versus circle intersection.
- Most useful if implemented with simplified/indexed boundary segments.

## 10. Avoid `safeUnion` For Large Station Sets Unless Explicit

`displayHidingZonesStyle === "no-overlap"` calls:

```ts
safeUnion(turf.featureCollection(circles));
```

This is one of the riskiest operations for hundreds of circles.

Potential improvements:

- Lazy compute only when the user selects `no-overlap`.
- Warn or disable above a threshold on mobile.
- Chunk/worker this mode.
- Use lower-fidelity circles for union.
- Cache union result by station ids/radius/style.

## 11. Cache Raw Station Discovery Separately From Geometry

Current `hidingZoneData` caches full station circles plus source inputs.

Consider separate caches:

- raw station candidates from Overpass/custom import
- operator-filtered station candidates
- transit graph
- station bboxes
- final active station ids
- optional display geometry

Benefits:

- Changing radius does not require refetching stations.
- Changing display style does not require recomputing station filtering.
- Sharing can omit heavy derived geometry.

## 12. Reduce Live-Sync Payload Size

`hidingZone` currently includes `hidingZoneData`, which can include hundreds of full circle polygons.

Potential policy:

- Do not include full derived circle geometry in CAS/share payloads by default.
- Include custom stations and source settings.
- Let receiving clients recompute derived station circles.
- Optionally include a compact runtime cache only if below a size threshold.

Benefits:

- Less main-thread `structuredClone`.
- Less `canonicalize`.
- Less compression.
- Smaller CAS payloads.
- Less reload memory pressure.

Caution:

- Recomputing after share load may be slower.
- Could keep compact station ids or points to avoid Overpass refetch where possible.

## 13. Add Large-Station UX Guardrails

For large station counts, proactively switch to lighter behavior.

Examples:

- Above 250 stations on mobile, default to `stations` display instead of `zones`.
- Above 500 stations, compute station eligibility but do not draw circles until zoomed in.
- Offer "Show circles anyway" with a warning.
- Render circles only inside current viewport.
- Use clustered point markers until zoomed in.

This is not just performance polish; it prevents Safari from entering a reload/freeze loop.

## 14. Render Viewport-Only Circles

For visual display, only render stations whose radius bbox intersects the current map viewport bbox.

Benefits:

- Massive rendering savings when zoomed in.
- Keeps full station set available in state/search.

Caution:

- The count/list still needs to represent all active stations.
- Need to update rendered set on map pan/zoom.

## 15. Benchmark And Instrument

Add coarse timing around:

- station source loading
- custom station normalization
- bbox filtering
- playable zone reconstruction
- circle generation
- exact intersection checks
- station question filters
- Leaflet layer creation
- live-sync clone/canonicalize/compress

Example logging shape:

```ts
performance.mark("hiding-zone:start");
// ...
performance.measure("hiding-zone:circle-filter", start, end);
```

Use this to decide which optimizations actually matter on real devices.
