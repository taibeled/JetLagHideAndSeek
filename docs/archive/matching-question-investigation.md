# Matching Question Investigation

Date: 2026-05-31

## Summary

The OSM-backed matching implementation is not currently reliable enough to use
for hiding-zone elimination. The screenshot's museum result is explained by an
accidental Overpass output limit: the app requests POIs within 50 km, asks
Overpass to sort them by quadtile, and then asks Overpass to return only 50
records. The app sorts those 50 records by distance afterward, but nearby Tokyo
museums may already have been discarded.

There is also a broader modeling problem. OSM matching fetches and keeps POIs
relative to the question pin only. It does not use the play-area boundary or the
selected hiding-zone geometry when choosing the candidate set. The derived map
mask later intersects a Voronoi result with the hiding zones, but that cannot
restore POIs that were never fetched or were discarded before Voronoi
generation.

## Reproduction

The screenshot shows a museum pin near `35.67607, 139.70479`. The generated
query is equivalent to:

```overpass
[out:json][timeout:30];
(
  node["tourism"="museum"](around:50000,35.67607,139.70479);
  way["tourism"="museum"](around:50000,35.67607,139.70479);
  relation["tourism"="museum"](around:50000,35.67607,139.70479);
);
out center tags qt 50;
```

On 2026-05-31, a live POST of this query to
`https://overpass.kumi.systems/api/interpreter` returned exactly 50 named
records. After sorting that response by distance in the same way as the app,
the nearest sampled museum was still `36.899 km` away. The next sampled records
included the same southwest-Kanagawa museums visible in the screenshot:

|    Distance | OSM type/id       | Name                               |
| ----------: | ----------------- | ---------------------------------- |
| `36.899 km` | `node/1420830414` | `神奈川県立地球市民かながわプラザ` |
| `37.550 km` | `node/1420832785` | `藤沢市湘南台文化センターこども館` |
| `37.570 km` | `node/1420830439` | `神奈川県立金沢文庫`               |

Removing the trailing `50` from the same query returned `883` elements, of
which `834` were named. After distance sorting, the closest museum was
`こども鉱物館` at `0.440 km`. The next result was `明治神宮ミュージアム` at
`0.481 km`. This confirms that the nearby Tokyo results existed in Overpass and
were discarded by the generated query before the app received them.

The OpenStreetMap Overpass QL reference documents that:

- `qt` sorts output by quadtile index, which is roughly geographic.
- A non-negative integer on an `out` statement limits the maximum number of
  returned elements.
- `center` adds the bounding-box center for ways and relations, and that point
  is not guaranteed to lie inside the polygon.

Reference:
[Overpass QL `out` statement](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#out)

The configured `https://overpass-api.de/api/interpreter` endpoint returned HTTP
`406` to terminal probes during this investigation. The alternate public
instance was used to verify the generated query behavior. This is a separate
availability risk because the app has one hard-coded endpoint and no fallback.

## Findings

### P0: The Overpass query discards most POIs before distance sorting

[`osmMatching.ts`](../src/features/questions/matching/osmMatching.ts) converts
the search radius from meters to kilometers and appends that number to the
`out` statement:

```ts
const radiusKm = Math.round(radiusMeters / 1000);
// ...
out center tags qt ${radiusKm};
```

For the default `50_000` meter radius, this becomes `out center tags qt 50;`.
That final `50` is not a radius. It caps the Overpass response at 50 elements.
Because `qt` orders the capped response geographically rather than by distance
from the matching pin, dense categories can return an arbitrary regional slice.
The client-side sort at the end of `findMatchingFeatures` is too late to recover
discarded POIs.

The existing unit test asserts that `out center tags qt 5;` is generated for a
5 km query, so it currently locks in the bug instead of detecting it.

### P0: Candidate discovery is disconnected from the eligible hiding region

[`OsmMatchingQuestionDetailScreen.tsx`](../src/features/questions/matching/OsmMatchingQuestionDetailScreen.tsx)
calls:

```ts
findMatchingFeatures(question.category, question.center);
```

The fetch path receives only the category and question pin. It does not receive
`playArea.boundary`, `playArea.bbox`, or hiding-zone `zoneFeatures`.

The selected play area and hiding zones are applied only later in
[`NativeMap.tsx`](../src/features/map/NativeMap.tsx), when the map combines
`zoneFeatures` with a matching-question Voronoi mask. That visual intersection
cannot correct an incomplete POI set.

The query scope should be derived from the region whose nearest-POI ownership
must be classified. For hiding-zone elimination, that means the current
eligible hiding region, plus enough surrounding POIs to account for candidates
just outside its boundary that may still be nearest to an interior point.

### P0: Keeping only ten pin-nearest candidates makes the Voronoi mask incomplete

Even if the accidental Overpass limit is removed,
[`osmMatching.ts`](../src/features/questions/matching/osmMatching.ts) defaults
to `maxCandidates = 10` and returns:

```ts
return withDistance.slice(0, maxCandidates);
```

[`osmMatchingGeometry.ts`](../src/features/questions/matching/osmMatchingGeometry.ts)
then builds the play-area Voronoi partition from only those retained records.
This answers a narrower question: "which of the ten POIs nearest the question
pin owns this map point?" It does not answer: "which real POI is nearest to this
map point?"

This is especially incorrect when hiding zones span a city. A museum omitted
because it is farther from the question pin may still be the nearest museum for
a hiding zone on the other side of the play area. Candidate reduction is valid
only after proving that discarded POIs cannot influence the eligible region.

### P1: Moving the pin leaves stale candidates and a stale selected target

The matching screen updates the pin through `updateQuestionCenter`, which
changes `center` and `updatedAt` only. Existing `candidates`, `selectedOsmId`,
and `targetOsmId` remain unchanged.

The automatic search effect runs only once on mount and only when
`question.candidates.length === 0`. As a result:

1. Open an OSM matching question and wait for results.
2. Move the pin on the map or use "Set pin to my location".
3. Observe that the coordinates change but the candidate rows, selected POI,
   and map mask remain based on the previous location.

The Refresh button repairs this manually, but the UI does not mark the shown
results as stale. Play-area and hiding-zone changes can also invalidate the
rendered classification without triggering candidate discovery again.

Concurrent refreshes have no abort or request-generation guard, so an older
response can overwrite a newer search.

### P1: Shared OSM matching answers restore without their geometry

The compact wire format intentionally omits `candidates`. During unminification,
[`minified.ts`](../src/sharing/wire/minified.ts) restores OSM matching questions
with `candidates: []` while preserving `answer`, `targetOsmId`, and the selected
target fields.

[`osmMatchingGeometry.ts`](../src/features/questions/matching/osmMatchingGeometry.ts)
excludes questions with no candidates from render state. Therefore, an imported
answered OSM matching question does not constrain the map until its detail
screen is opened and a successful network search runs. That is a silent
behavior change after sharing.

Local persisted app state has a smaller related issue:
[`appState.ts`](../src/state/appState.ts) accepts persisted candidates but its
schema strips `distanceMeters`. After restart, non-empty candidates suppress
auto-search while their distance labels disappear until a manual refresh.

### P1: One centroid-based algorithm does not fit every exposed category

The Overpass parser represents ways and relations using `out center`. Per the
Overpass reference, this is the center of the element's bounding box and may
fall outside its polygon. The app then computes haversine distance and point
Voronoi cells from that center.

This approximation may be tolerable for small museum buildings, but it is not a
correct nearest-feature model for large parks, golf courses, airports, or
administrative divisions. Administrative matching is particularly different:
containment and shared division identity matter more than distance to a
relation's bounding-box center.

Category implementations should declare their geometry semantics instead of
routing every OSM tag through one point-centroid pipeline.

### P2: Voronoi identity ignores OSM element type

The UI identifies a candidate by `(osmType, osmId)`, but
[`matchingVoronoi.ts`](../src/features/questions/matching/matchingVoronoi.ts)
stores and matches only `osmId`. OSM node, way, and relation IDs are separate
namespaces. If two returned candidates share a numeric ID, hit and miss masks
can select or exclude the wrong cell.

Use a stable composite key such as `${osmType}/${osmId}` throughout candidate
properties and mask selection.

### P2: Duplicate POI coordinates can create malformed Turf Voronoi cells

There is no candidate deduplication before calling `@turf/voronoi`. A local
probe with two points at identical coordinates produced a sparse Turf feature
entry without geometry. `computeVoronoiCells` then spreads that entry into the
returned collection. Duplicate OSM representations or identical centers can
therefore produce invalid map geometry.

Deduplicate candidates intentionally and validate generated cells before they
reach map rendering or polygon operations.

## Test Gaps

The current tests cover parsing, sorting a mocked response, slicing to ten
records, and Voronoi construction from already-good candidates. They do not
cover the correctness boundary:

- A dense Overpass result where the true nearest POI is outside the first 50
  quadtile records.
- Candidate coverage across the full eligible hiding region.
- Pin movement invalidating candidates and selected target.
- Play-area or hiding-zone changes invalidating matching geometry.
- Sharing an answered OSM matching question and restoring an equivalent map
  constraint.
- OSM type/id collisions.
- Duplicate candidate coordinates.
- Polygon and administrative-category distance semantics.

## Recommended Fix Order

1. Remove the accidental Overpass `out` limit and add a regression test for the
   generated query.
2. Define the correctness contract for candidate discovery: classify the
   current eligible hiding region, not a fixed-radius sample around the pin.
3. Replace the unconditional ten-candidate slice with a coverage-preserving
   strategy.
4. Invalidate or refresh search-derived state when the pin, play area, or
   hiding-zone setup changes. Guard against stale async responses.
5. Make sharing either carry sufficient derived candidate data or explicitly
   rebuild it before applying imported answered constraints.
6. Split point-like and area-like category geometry semantics.
7. Use composite OSM identity and deduplicate candidate points before Voronoi
   generation.
