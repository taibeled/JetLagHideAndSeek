# Map Performance and Caching Audit

Date: 2026-06-01

## Executive Summary

The app already has several useful caches: MapLibre's ambient raster tile cache,
long-lived play-area boundary caching, a Photon search LRU, an exact hiding-zone
union LRU, a combined-mask LRU, and a Voronoi LRU. The remaining performance
opportunities are less about adding `useMemo` and more about changing cache
boundaries so that work can survive partial edits.

The highest-impact recommendations are:

1. Cache OSM matching Overpass results by reusable spatial coverage, persist
   them with stale-while-revalidate behavior, and deduplicate in-flight
   requests. This removes repeated network waits from the interactive matching
   question flow.
2. Decompose hiding-zone unions into reusable overlap components. The current
   whole-result cache only helps exact repeats, while a radius or preset change
   rebuilds every station circle and unions the entire network.
3. Cache per-question geometry fragments, especially radar circles and OSM
   matching masks. A change to one question currently rebuilds derived geometry
   for all questions.
4. Add bbox rejection before exact polygon clipping. A bbox miss can prove that
   a geometry cannot affect the result, so the expensive clip operation can be
   skipped without changing behavior.
5. Bound and lazily hydrate persistent caches. Long retention is appropriate
   for OSM data, but startup and memory costs should be controlled with a
   manifest and weighted LRU limits.

These changes follow common mapping-system patterns: spatially partition data,
reuse immutable geometry fragments, perform cheap bbox filtering before exact
geometry operations, and return stale data immediately while refreshing it in
the background.

## Scope and Method

This audit covers runtime network calls, state persistence, GeoJSON derivation,
polygon clipping, and MapLibre source updates. It is based on static code
inspection plus a read-only local Node benchmark against the bundled Tokyo
transit presets. The benchmark is directional evidence, not a production mobile
profile.

The app's primary rendering path is:

```text
app state
  -> derived feature collections and eligibility masks
  -> React Native ShapeSource props
  -> MapLibre native rendering
```

The best improvements reduce work before data crosses the React Native bridge.

## Current Cache Inventory

| Area                      | Current behavior                                                                                                                                                                                                  | Main limitation                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Raster map tiles          | MapLibre ambient cache is configured at 100 MiB in [`NativeMap.tsx`](../src/features/map/NativeMap.tsx).                                                                                                          | Keep this. Public `tile.openstreetmap.org` usage must not add bulk prefetch or offline-pack behavior.     |
| Play-area boundaries      | [`playAreaBoundary.ts`](../src/features/map/playAreaBoundary.ts) has bundled Tokyo and Osaka data, a memory cache, AsyncStorage persistence, a 30-day stale-while-revalidate window, and in-flight deduplication. | Memory and disk entries are unbounded, and startup hydration scans and parses all boundary cache entries. |
| Play-area Photon search   | [`playAreaSearch.ts`](../src/features/playArea/playAreaSearch.ts) has a 50-entry in-memory LRU keyed by normalized query.                                                                                         | No persistent cache, stale reuse, in-flight dedupe, or out-of-order response guard.                       |
| OSM matching candidates   | [`osmMatching.ts`](../src/features/questions/matching/osmMatching.ts) calls Overpass for each matching search. The detail screen debounces and aborts prior requests.                                             | No shared memory cache, persistent cache, stale reuse, spatial reuse, or in-flight dedupe.                |
| Hiding-zone area          | [`hidingZone.ts`](../src/features/hidingZone/hidingZone.ts) has a 30-entry exact-result LRU keyed by all selected stations and radius.                                                                            | A partial edit or new radius rebuilds all circles and runs one union over the full set.                   |
| Combined eligibility mask | [`maskBuilder.ts`](../src/features/map/maskBuilder.ts) has a 40-entry result LRU and a WeakMap for extracted polygons.                                                                                            | No bbox rejection before clipping. Upstream feature-object churn reduces identity-cache hits.             |
| Matching Voronoi cells    | [`matchingVoronoi.ts`](../src/features/questions/matching/matchingVoronoi.ts) has a 20-entry exact-result LRU.                                                                                                    | Downstream selected-cell and name-length masks are rebuilt from the cached cells.                         |
| Question-derived geometry | [`questionGeometry.ts`](../src/features/questions/questionGeometry.ts) rebuilds family render state from the questions array.                                                                                     | Any question edit can recreate unaffected radar, matching, and transit fragments.                         |
| Persisted app state       | [`persistence.ts`](../src/state/persistence.ts) serializes the entire questions slice after a question edit.                                                                                                      | Matching candidates and tags make small edits rewrite larger JSON payloads.                               |

## Local Union Benchmark

The current hiding-zone builder creates 48-step Turf circles and performs one
Turf union over all selected stations. The generated ODPT presets contain:

| Preset      | Stations | Routes |
| ----------- | -------: | -----: |
| Tokyo Metro |      185 |      9 |
| Toei Subway |      149 |      6 |
| Combined    |      334 |     15 |

One local Node run against the combined presets produced:

| Radius | Stations | Bbox-overlap components | Largest component | Circle build | One full union | Per-component unions |
| ------ | -------: | ----------------------: | ----------------: | -----------: | -------------: | -------------------: |
| 300 m  |      334 |                     144 |                59 |       5.0 ms |       240.5 ms |             140.1 ms |
| 500 m  |      334 |                      59 |               233 |       3.2 ms |       299.7 ms |             265.9 ms |
| 600 m  |      334 |                      37 |               284 |       3.2 ms |       356.9 ms |             331.7 ms |
| 1 km   |      334 |                       5 |               327 |       4.0 ms |       685.6 ms |             673.8 ms |

The exact timings will differ on-device. The useful result is structural:
circle generation is cheap relative to unioning, and common radii still have
many disconnected components. Component-level reuse can preserve unaffected
work after a partial edit even when the one-time partitioned union cost is
close to the existing full union.

## Formal Performance Replay Suite Plan

The repository does not currently have an established benchmark command. There
is no universal package-script name for this kind of application-specific
replay suite, so add:

```text
pnpm perf:test
```

This should become a first-class engineering workflow, separate from Jest and
native E2E:

- Jest proves correctness for focused units and state behavior.
- `pnpm perf:test` replays deterministic captured workloads against pure domain
  functions and reports timing, cache behavior, and output size.
- Native E2E verifies that the app still feels responsive after the same
  source-composition changes reach React Native and MapLibre.

The performance suite must run offline. Network access belongs in a separate,
explicit fixture-capture command so a benchmark result is never affected by
Overpass or Photon latency, service health, or live-data drift.

### Implemented Baseline

The replay suite described below is now implemented under [`perf/`](../perf/).
It contains `61` offline scenarios, a checked-in fixture manifest, captured raw
network responses, a reference baseline, and a Markdown comparison renderer.

Tracked artifacts:

| Artifact                                                            | Purpose                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`perf/README.md`](../perf/README.md)                               | Workflow and result interpretation.                             |
| [`perf/capture-manifest.json`](../perf/capture-manifest.json)       | Reviewed live requests used to refresh the fixture corpus.      |
| [`perf/baselines/reference.json`](../perf/baselines/reference.json) | Machine-readable reference timings, digests, and counters.      |
| [`perf/scenarios/`](../perf/scenarios)                              | Offline replay definitions grouped by subsystem.                |
| [`perf/models/replay-cache.mts`](../perf/models/replay-cache.mts)   | Prototype adapter contract for cache behaviors not yet shipped. |

The checked-in captured network corpus is approximately `672 KiB` after
formatting and contains:

| Fixture family               | Checked-in samples                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Overpass boundary conversion | Vatican City relation `36989` and Monaco relation `1124039`.                                               |
| OSM matching                 | Tokyo stations, hospitals, museums, airports, plus an empty-result ocean hospital query.                   |
| Photon                       | Tokyo, Osaka, and Shibuya search responses.                                                                |
| Existing app fixtures        | Bundled Tokyo and Osaka play areas plus generated Tokyo Metro and Toei Subway presets are reused directly. |

The boundary fixtures are intentionally compact. The first attempted capture
used the larger Osaka administrative relation and received an Overpass `504`.
The capture command now uses bounded retries, backoff, and a 45-second timeout
so a fixture refresh fails cleanly when a public endpoint is overloaded.

The reference baseline was captured on an Apple M3 with Node `v24.11.0`. Timing
values are advisory and machine-specific; canonical output digests and
structural counters are the deterministic signals. A consecutive full
`perf:test` run produced matching digests for all `61` scenarios.

Selected reference medians:

| Scenario                                           |      Median | Structural result                                         |
| -------------------------------------------------- | ----------: | --------------------------------------------------------- |
| Hiding-zone route and station derivation           |   `0.06 ms` | `334` selected stations.                                  |
| Combined hiding-zone union at `600 m`, cold        | `333.23 ms` | `4,914` output vertices.                                  |
| Combined hiding-zone union at `600 m`, exact hit   |   `0.15 ms` | Existing whole-result LRU is effective for exact repeats. |
| Combined hiding-zone union after one station edit  | `330.05 ms` | Current cache cannot preserve unaffected union work.      |
| Add Toei preset after Tokyo Metro at `600 m`       | `329.69 ms` | Current cache rebuilds the combined union.                |
| Combined hiding-zone union at `1 km`, cold         | `661.30 ms` | The larger radius remains the most expensive replay.      |
| Eager hydration of 50 synthetic boundary entries   |  `12.86 ms` | Parses about `3.95 MiB` and `160,000` vertices.           |
| Parse the equivalent boundary manifest             |   `0.01 ms` | Parses `1,651` bytes without hydrating boundary geometry. |
| Render 10 matching questions                       |   `0.88 ms` | `204` output vertices.                                    |
| Render after one matching-answer edit              |   `0.86 ms` | Unchanged fragments are currently rebuilt.                |
| Build 50 radar questions                           |   `0.65 ms` | `6,500` output vertices.                                  |
| Serialize 100-question whole slice                 |   `1.04 ms` | `317,307` serialized bytes.                               |
| Serialize one normalized question-record prototype |   `0.02 ms` | `6,125` serialized bytes.                                 |

Network-cache scenarios are split deliberately:

- `matching-network/*` and `photon/*` record current production behavior with
  fixture-backed transport. For example, repeating the current hospital search
  produces two network intents and zero cache hits.
- `matching-cache-prototype/*` and `photon-cache-prototype/*` encode the target
  adapter contract for persisted hits, stale reuse, in-flight dedupe, negative
  caching, and latest-response ordering. They are measurement targets, not a
  claim that those production caches have shipped.

### Proposed Commands

| Command                                      | Purpose                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm perf:test`                             | Replay the tracked default corpus serially and print a concise comparison table.                       |
| `pnpm perf:test -- --scenario hiding-zone`   | Run one scenario family while iterating.                                                               |
| `pnpm perf:test -- --json perf/results.json` | Write machine-readable results for before/after comparisons and CI artifacts.                          |
| `pnpm perf:compare -- --baseline <file>`     | Compare the current result JSON with a checked-in or branch-base baseline and render Markdown or HTML. |
| `pnpm perf:capture -- --manifest <file>`     | Explicitly fetch and refresh approved network fixtures. This command is never invoked by `perf:test`.  |
| `pnpm perf:baseline`                         | Intentionally refresh the checked-in reference baseline after review on a stable development machine.  |
| `pnpm perf:typecheck`                        | Type-check the `.mts` replay harness. This also runs as part of `pnpm check`.                          |

The implementation uses a small dedicated runner under `perf/`, the lightweight
`tsx` development dependency, and Node's built-in `node:perf_hooks`
measurement API. Do not run these microbenchmarks through Jest: Jest is
appropriate for correctness, but its transforms, mocks, and test isolation add
noise to measurements.

Implemented layout:

```text
perf/
  README.md
  capture-manifest.json
  capture.mts
  run.mts
  compare.mts
  fixtures/
    overpass/
      boundaries/
      matching/
    photon/
    app-state/
  scenarios/
    boundary.mts
    hiding-zone.mts
    matching.mts
    mask-builder.mts
    persistence.mts
    radar.mts
  baselines/
    reference.json
  results/
    .gitignore
```

Reuse checked-in application fixtures such as
[`hiding-zone-presets.json`](../data/odpt/generated/hiding-zone-presets.json),
[`tokyo.json`](../assets/default-zones/tokyo.json), and
[`osaka.json`](../assets/default-zones/osaka.json) directly rather than copying
them into `perf/`.

### Runner Contract

The suite should exercise production domain code through narrow adapters:

```text
network transport
cache storage
clock
metrics sink
```

Production adapters use `fetch`, AsyncStorage, `Date.now()`, and normal metrics
handling. Replay adapters use tracked fixture responses, an in-memory or
temporary-file store, a controlled clock, and a collector. This makes stale
hits, persisted hits, negative hits, and in-flight dedupe reproducible without
booting React Native. `perf:test` should fail immediately if any scenario tries
to perform an outbound network request.

The extraction work is small but useful architecture in its own right.
[`playAreaBoundary.ts`](../src/features/map/playAreaBoundary.ts) already
separates raw boundary conversion into `buildPlayAreaFromOverpass()`.
[`osmMatching.ts`](../src/features/questions/matching/osmMatching.ts) already
separates `parseOverpassElements()`. Keep moving transport and computation apart
where the suite exposes a missing boundary.

Each scenario should declare:

```text
scenario name
fixture version and input hash
warm-up iteration count
measured iteration count
setup function
measured function
canonical output digest
structural counters
```

Run scenarios serially to reduce contention. Execute warm-up iterations before
recording measurements, then report at least median, p95, minimum, and maximum
duration. Use enough iterations for cheap functions and fewer iterations for
expensive polygon unions.

Record structural metrics alongside wall-clock time:

```text
input byte count
input feature count
output feature count
output vertex count
cache hit and miss count
cache retained entry count
cache estimated bytes or vertices
canonical output digest
```

Record run metadata in the JSON artifact:

```text
git commit and dirty-worktree flag
Node version
operating system and architecture
CPU model
fixture-manifest hash
runner version
```

Before/after timing comparisons are meaningful only when the execution
environment and fixture manifest are comparable.

Heap deltas may be recorded as directional diagnostics, but they should not be
hard pass/fail metrics because garbage collection timing is noisy.

The canonical output digest is important. It lets an optimization demonstrate
that it produced the same geometry after feature order and property ordering
have been normalized. Performance work should not quietly alter gameplay
results.

Start with advisory timing comparisons. Fail CI on deterministic regressions
such as output digest changes, unexpected network calls, cache-hit count
changes, or vertex-count explosions. Add timing budgets only after enough CI
history exists to choose thresholds that tolerate runner variance. A useful
first timing signal is a warning when the median regresses by more than a
reviewed percentage against the selected baseline.

### Fixture Capture Strategy

Check in a small, representative corpus. Capture enough diversity to expose
algorithmic behavior without turning the repository into an OSM mirror.

Each captured network fixture should preserve:

```text
fixture schema version
capture timestamp
source endpoint
request query or normalized parameters
query signature
response SHA-256
response byte count
license and attribution note
raw response payload
```

Capture raw responses before app parsing. This allows the suite to benchmark
conversion, filtering, indexing, caching, and derived geometry independently.
When cache schemas change, old raw fixtures remain useful.

Run `perf:capture` manually and sequentially with conservative request pacing.
Refresh fixtures only when query semantics change, a new representative case is
needed, or a reviewed periodic refresh is desired. Never refresh fixtures as
part of CI. Keep secrets such as provider keys out of tracked files; the
current runtime Overpass and Photon captures do not require secrets.

Build the initial corpus from:

| Fixture family                 | Initial samples                                                                                                                                                                        | What it exercises                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Bundled play areas             | Existing Tokyo 23 Wards and Osaka fixtures.                                                                                                                                            | Startup metadata, play-area masks, bbox calculations, and small versus larger boundary complexity.   |
| Captured Overpass boundaries   | Compact Vatican City and Monaco relations, with additional custom boundaries added when a feature needs them.                                                                          | Raw Overpass-to-GeoJSON conversion, boundary filtering, metadata generation, and cache hydration.    |
| Captured OSM matching          | Dense urban Tokyo samples for `station-name-length`, `hospital`, and `museum`; one sparse category such as `commercial-airport`; one empty-result location; nearby moved-center cases. | Parsing, dedupe, distance sorting, negative caching, spatial containment reuse, and bbox-cell merge. |
| Captured Photon search         | A few repeated relation searches such as Tokyo, Osaka, and a less common custom area.                                                                                                  | Mapping, dedupe, query LRU behavior, stale reuse, and payload parsing.                               |
| Generated transit presets      | Existing Tokyo Metro, Toei Subway, and combined preset selections.                                                                                                                     | Route and station derivation plus hiding-zone union behavior.                                        |
| Synthetic question collections | Small, medium, and larger radar and matching-question sets with one-question edits.                                                                                                    | Fragment-cache reuse, top-level collection churn, output vertices, and persistence cost.             |
| Synthetic mask cases           | Bbox-disjoint, bbox-touching, partial-overlap, and heavily overlapping constraints.                                                                                                    | Exact clipping cost, bbox short-circuit counts, and correctness proofs.                              |

Nearby moved-center matching cases should be replayed from one captured
overscan response where the containment rule allows reuse. For bbox-cell
prototypes, capture a fixed set of adjacent cells and verify that the union of
loaded cells covers the requested search disk before local distance filtering.

### Initial Scenario Matrix

| Scenario family           | Required replays                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boundary conversion       | Raw Overpass response -> filtered boundary -> bbox, center, and mask metadata; cold parse and cached metadata reuse.                                                  |
| Hiding-zone geometry      | Tokyo Metro, Toei Subway, and combined presets at `300 m`, `600 m`, and `1 km`; cold build, exact repeat, one-station edit, preset add/remove, and radius return.     |
| Matching network cache    | Cold fixture load, memory hit, persisted hit, stale hit plus background-refresh intent, in-flight dedupe, containment hit, containment miss, and cached empty result. |
| Matching geometry         | Candidate parsing, distance sort, Voronoi build, selected-cell mask, name-length mask, exact repeat, and one-answer edit.                                             |
| Combined eligibility mask | Required and excluded constraints with disjoint, touching, partial-overlap, and full-overlap bboxes; exact repeat and one-fragment edit.                              |
| Radar geometry            | Collections of 1, 10, and 50 radar questions; cold build, exact repeat, one-answer edit, and one-distance edit.                                                       |
| Persistence               | Existing whole-slice serialization plus normalized-record prototypes for small, medium, and larger question sets.                                                     |
| Photon search cache       | Cold parse, memory hit, persisted stale hit, duplicate query, and out-of-order response protection.                                                                   |

### How the Suite Helps Each Recommendation

| Recommendation                          | Measurements and proof added by `pnpm perf:test`                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persist spatial OSM matching results    | Compare cold fixture parsing with exact, containment, bbox-cell, stale, negative, and in-flight hits. Assert that every reused result is distance-filtered from a proven coverage region. |
| Union hiding zones by overlap component | Measure cold build, full-union baseline, component build, warm repeat, one-station edit, preset add/remove, and radius return. Report reused component count and unioned input circles.   |
| Cache per-question geometry fragments   | Edit one question in synthetic 10- and 50-question collections. Report reused fragment count, regenerated fragment count, output digest, vertices, and elapsed time.                      |
| Add bbox rejection before clipping      | Replay disjoint and overlap masks. Report short-circuited intersections and differences, exact clip calls, digest equality, and elapsed time.                                             |
| Lazily hydrate boundary caches          | Compare manifest parse, active-entry load, and eager all-entry hydration over synthetic cache sizes. Report parsed bytes and startup work avoided.                                        |
| Persist Photon results                  | Replay duplicate and stale queries. Report parse count, network-intent count, cache hits, and out-of-order response handling.                                                             |
| Normalize question persistence          | Compare serialized bytes and elapsed time for one-question edits as matching candidate payloads grow.                                                                                     |
| Add weighted cache budgets              | Replay a mixed workload and report retained entry count, estimated bytes, vertices, hit rate, and evictions.                                                                              |

The suite should make partial-update improvements visible. A cold benchmark
alone can miss the main user experience win: changing one station, one answer,
or one pin should preserve most existing work.

### Before/After Visualization

`perf:compare` should render a compact table per scenario:

```text
scenario
baseline median
current median
absolute delta
percentage delta
p95 delta
cache hits and misses
output vertices
output digest status
```

Write JSON for automation and Markdown or a small standalone HTML report for
humans. Keep raw per-iteration samples in the JSON artifact so a reviewer can
spot noisy runs. A pull request can attach the rendered comparison without
making generated result files part of normal source control.

## Priority Recommendations

### P0: Persist Spatial OSM Matching Search Results

**Problem**

[`findMatchingFeatures`](../src/features/questions/matching/osmMatching.ts)
builds an Overpass `around` query, fetches results, computes distances, sorts,
and returns the nearest candidates. The screen debounce in
[`OsmMatchingQuestionDetailScreen.tsx`](../src/features/questions/matching/OsmMatchingQuestionDetailScreen.tsx)
reduces request volume while typing or moving a center, but a nearby follow-up
search still waits for another network request.

OSM feature data changes slowly enough for a long-lived local cache. This is the
clearest user-visible network caching opportunity.

**Recommended architecture**

Use a two-stage rollout:

1. Add an immediate overscan-circle cache. Fetch a larger radius than the UI
   needs, persist the full normalized result set, and reuse it for a moved
   center when the cached circle still covers the requested search circle.
2. Move toward fixed bbox query windows. Key entries by query signature and
   deterministic spatial cell. Fetch the cells needed to cover the requested
   search disk, merge results by OSM identity, then calculate exact distances
   and select the nearest candidates locally.

Keep the initial overscan modest and tune it against payload size and endpoint
latency. Fixed bbox windows are the better long-term option for dense categories
because they avoid turning reuse into oversized Overpass requests.

Cache raw normalized matching features before applying the nearest-candidate
limit. Caching only the top ten is incorrect for a moved center because a
previously discarded feature can become one of the nearest results.

A cache entry should include:

```text
schemaVersion
querySignature
coverage bbox or circle
fetchedAt
lastAccessedAt
staleAt
features keyed by OSM type and ID
```

Add:

- A bounded in-memory LRU for instant reuse.
- AsyncStorage persistence for the first implementation.
- A manifest so disk entries can be pruned without parsing all payloads.
- In-flight promise deduplication per spatial key.
- Cached empty results.
- Stale-while-revalidate behavior with a long stale window, such as 90 days.
- A force-refresh affordance for users who need current OSM data.
- Instrumentation for hit type: memory, disk, stale, network, and containment
  miss.

If the cache grows beyond a small number of JSON entries, move the spatial cache
to SQLite rather than turning AsyncStorage into a large local database.

**Correctness contract**

For the initial circle cache, a cached search centered at `a` with radius `R`
can answer a request centered at `b` with radius `r` only when:

```text
distance(a, b) + r <= R
```

That proves the requested circle is contained within the fetched circle.

For fixed bboxes, reuse is valid only when the union of loaded bbox windows
covers the entire requested search region. The merged candidate list must still
be filtered and distance-sorted locally.

**Why this matches mapping practice**

Overpass documents bounding boxes as the simplest way to obtain OSM data for a
small region. Spatial windows are reusable, deterministic cache keys; arbitrary
drag positions are not.

### P0: Union Hiding Zones by Reusable Overlap Component

**Problem**

[`buildHidingZoneFeatureCollection`](../src/features/hidingZone/hidingZone.ts)
creates one circle polygon per station and unions the entire selected station
set. Its final-result LRU is valuable for exact repeats, but any station,
preset, or radius change invalidates the whole result.

The local benchmark shows that unioning dominates the cost and that many
station groups are disconnected at common radii.

**Recommended architecture**

Represent the hiding-zone computation as immutable intermediate fragments:

1. Cache each station circle by station identity, coordinate, radius, circle
   step count, and algorithm version.
2. Cache each circle bbox alongside its polygon.
3. Build an overlap graph from circle bboxes.
4. Find connected components.
5. Union circles only within each component.
6. Cache each component output by sorted station-circle signatures and
   algorithm version.
7. Return a feature collection of component results. Avoid re-unioning
   disconnected outputs unless a downstream API truly requires one polygon.

On a partial edit, recompute graph membership around changed inputs and reuse
every component whose signature is unchanged. A radius edit is broader, but
the station-circle cache still helps when returning to a recent radius.

Keep full render geometry and gameplay eligibility geometry separate:

- Render geometry may include every selected station if the UI intentionally
  shows areas outside the play area.
- Eligibility geometry can exclude any station circle whose bbox misses the
  play-area bbox before unioning.

For the current few hundred stations, a simple bbox comparison graph is a
reasonable first implementation. If the dataset grows, use an R-tree such as
RBush to find nearby bbox candidates efficiently.

**Correctness proof**

If two polygon bboxes do not intersect, the polygons cannot intersect. Their
unions are independent. Grouping by bbox overlap may create components larger
than necessary, but it cannot incorrectly split polygons that might overlap.

If a component signature is unchanged, its union result is unchanged and can be
reused exactly.

### P1: Cache Per-Question Geometry Fragments

**Problem**

[`buildQuestionMapRenderState`](../src/features/questions/questionGeometry.ts)
rebuilds radar, OSM matching, and transit render state from the full questions
array. Updating one question can recreate unaffected feature collections and
feature objects.

Radar has an especially clear duplication:
[`buildRadarQuestionRenderState`](../src/features/questions/radar/radarGeometry.ts)
builds positive, negative, outline, and preview collections independently.
Each radar circle is generated for the outline plus one answer-state
collection.

OSM matching has a similar second-stage issue:
[`matchingVoronoi.ts`](../src/features/questions/matching/matchingVoronoi.ts)
caches Voronoi cells, but selected-cell and name-length union masks are rebuilt
from those cells.

**Recommended architecture**

Add per-question fragment caches:

| Question type | Stable fragment key                                                                | Reusable output                                      |
| ------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Radar         | question ID, center, distance, algorithm version                                   | One circle geometry plus answer-state decorations    |
| OSM matching  | question ID, candidate signature, play-area bbox, answer inputs, algorithm version | Voronoi cells, POI points, selected or grouped masks |
| Transit line  | line ID, station signature, radius, answer inputs, algorithm version               | Hiding-zone component collection                     |

Compose top-level feature collections from stable fragment references. Keep
cached GeoJSON immutable. This preserves identity for downstream WeakMap caches
and reduces React Native bridge serialization when unrelated questions change.

For radar, generate a circle once and fan it out to the necessary collections.
Longer term, profile whether a single radar source with a stable answer-state
property and layer filters reduces native source uploads further.

MapLibre GL JS exposes `GeoJSONSource.updateData()` for diff-based source
updates with unique feature IDs. The current MapLibre React Native GeoJSON
source documentation exposes whole-source `data` replacement and read methods,
not an equivalent per-feature mutation API. Treat stable fragments and smaller
source payloads as the practical React Native strategy today, while assigning
stable feature IDs so a future bridge capability can be adopted cleanly.

### P1: Add Bbox Rejection Before Polygon Clipping

**Problem**

[`buildCombinedEligibilityMask`](../src/features/map/maskBuilder.ts) performs
exact polygon-clipping intersections, unions, and differences after extracting
polygons. Exact clipping is necessary for the final result, but many inputs can
be rejected with a cheap bbox test first.

**Recommended architecture**

Cache a bbox beside each immutable feature or polygon fragment. Before exact
clipping:

1. If a required-constraint bbox is disjoint from the current eligible bbox,
   return an empty eligible area immediately.
2. Skip any excluded-area fragment whose bbox is disjoint from the current
   eligible bbox.
3. Restrict exact clipping to overlap components whose bboxes intersect.
4. Cache early-return outcomes as well as fully clipped outputs.
5. Preserve stable input feature references so the existing WeakMap extraction
   cache remains effective.

This is the same two-pass model used by spatial databases: first reject with
bounding rectangles, then run exact geometry tests on survivors.

**Correctness proof**

For geometries `A` and `B`:

```text
bbox(A) disjoint bbox(B) => A intersection B is empty
bbox(A) disjoint bbox(B) => A difference B equals A
```

These are exact shortcuts. Bbox overlap does not prove polygon overlap, so
overlapping candidates must continue through exact clipping.

### P1: Bound and Lazily Hydrate Boundary Caches

**Problem**

[`playAreaBoundary.ts`](../src/features/map/playAreaBoundary.ts) now has a solid
long-lived cache. Its remaining issue is lifecycle cost:
`warmBoundaryCacheFromStorage()` enumerates all AsyncStorage keys, parses every
boundary entry, and fills an unbounded memory map after startup.

That is harmless with a handful of custom boundaries but scales poorly as the
cache becomes useful.

**Recommended architecture**

- Keep a compact boundary-cache manifest with relation ID, byte size,
  `fetchedAt`, and `lastAccessedAt`.
- Hydrate only the active boundary at startup.
- Load other entries lazily on demand.
- Use a bounded memory LRU.
- Prune disk entries by total bytes and last access, while retaining bundled
  defaults outside the eviction system.
- Precompute and persist generic mask metadata for fetched custom boundaries so
  the first render does not traverse polygon rings to rebuild it.

OSM boundaries can retain a long stale window. Retention and eager memory
hydration are separate decisions.

## Secondary Recommendations

### Persist Photon Search Results Conservatively

[`playAreaSearch.ts`](../src/features/playArea/playAreaSearch.ts) already has a
small memory LRU. Add in-flight dedupe and an AbortController or request
generation check so an older response cannot overwrite a newer query.

A small persistent stale cache can improve repeat searches, but this is lower
priority than OSM matching because Photon results are lightweight and the
search interaction is less geometry-heavy.

### Normalize Question Persistence

[`persistence.ts`](../src/state/persistence.ts) serializes the entire questions
slice after edits. OSM matching candidates carry tag maps, so a small answer
change can rewrite significantly more JSON than necessary.

Consider:

- A question index plus one persisted record per question ID.
- Dirty-record writes for edited questions only.
- Separating cached OSM candidates from question state and referencing them by
  query-cache key where practical.
- Keeping only tags required for display or matching semantics.

This becomes more valuable after the OSM spatial cache exists because network
cache payloads and durable game state can have separate retention policies.

### Precompute Transit Indexes

[`transitLineQuestion.ts`](../src/features/questions/transitLine/transitLineQuestion.ts)
filters stations and rebuilds option structures from selected presets. Build a
stable stations-by-route index whenever selected station data changes, then
reuse it while editing question centers and answers.

The current generated dataset is small enough that this is not a first-order
problem, but it is a clean architectural boundary and becomes useful if more
providers are added.

### Use Weighted Cache Budgets

The geometry LRUs are entry-count bounded. Polygon entries vary substantially
in vertex count and serialized size, so count alone is a weak proxy for mobile
memory pressure.

Add weighted limits based on vertex count or estimated serialized bytes:

```text
max entry count
max total vertices
max estimated bytes
```

Track hit rate, miss rate, build time, output vertex count, and estimated bytes
per cache family. A cache that retains expensive outputs but rarely hits should
be reduced or removed.

### Keep Visual Geometry Separate From Exact Gameplay Geometry

MapLibre React Native's GeoJSON source supports simplification tolerance,
clustering, `maxzoom`, and related rendering controls. MapLibre's large-data
guide also recommends reducing properties, chunking data, vector tiling, and
limiting visual detail.

These tools are useful for visual derivatives such as dense POI markers or
route overlays. Do not simplify the canonical geometry used to decide gameplay
eligibility. Render geometry and exact geometry should be separate products of
the same source state when their requirements differ.

## Spatial Rules to Encode

| Condition                                                     | Safe optimization                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Cached Overpass circle fully contains requested search circle | Reuse cached raw candidates, then distance-filter and sort locally. |
| Loaded Overpass bbox windows cover the requested search area  | Merge cached raw candidates, then distance-filter and sort locally. |
| Station-circle bbox misses play-area bbox                     | Skip that circle for eligibility unioning.                          |
| Two station-circle bboxes are disjoint                        | They cannot overlap and may remain in separate union components.    |
| Excluded-area bbox misses current eligible bbox               | Skip the difference operation.                                      |
| Required-area bbox misses current eligible bbox               | Return empty eligibility immediately.                               |
| Question fragment key is unchanged                            | Reuse immutable geometry and preserve feature identity.             |

These rules should live in tested helpers. They are valuable because they
replace expensive operations with proofs, not heuristics.

## Suggested Implementation Sequence

Each step can be implemented, measured, tested, and committed independently.

1. **Completed:** Add the `pnpm perf:test` offline replay harness, fixture manifest, initial
   tracked corpus, structured JSON output, and reference baseline. Include
   lightweight cache instrumentation and output digests from the beginning.
2. **Completed:** Add `pnpm perf:capture` for intentional fixture refreshes and
   `pnpm perf:compare` for Markdown or HTML before/after reports.
3. Add OSM matching memory cache, in-flight dedupe, persisted stale reuse, and
   overscan-circle containment checks.
4. Convert OSM matching to deterministic bbox cells if observed movement
   patterns justify broader spatial reuse.
5. Add per-radar immutable geometry fragments and reuse them across answer-state
   collections.
6. Cache per-question OSM matching fragments and second-stage Voronoi masks.
7. Add bbox pruning and early-result caching in the combined mask builder.
8. Decompose hiding-zone unioning into cached bbox-overlap components.
9. Add the boundary-cache manifest, lazy hydration, weighted memory limits, and
   custom-boundary mask metadata.
10. Normalize persisted question records if profiling shows meaningful
    serialization or AsyncStorage write cost.

## Verification Strategy

For each geometry change:

- Run `pnpm perf:test` before and after the change against the same tracked
  fixtures.
- Attach the `perf:compare` summary and call out cold, warm, and partial-edit
  scenarios.
- Compare new and old GeoJSON results for bundled fixtures after canonicalizing
  feature order.
- Add tests for bbox-disjoint, bbox-touching, overlapping, component merge, and
  component split cases.
- Assert cache hits for unchanged fragments after one local edit.
- Assert stale and in-flight request behavior with mocked network calls.
- Run `pnpm check`.
- Run native E2E for map and question flows when source composition changes.

For performance validation:

- Measure cold build, warm exact hit, and one-item edit.
- Profile both default `600 m` and larger `1 km` transit radii.
- Record JS duration and output vertex count before and after.
- Record output digests, cache hits, misses, retained weight, and eviction count.
- Treat timing thresholds as advisory until CI history supports stable budgets.
- Inspect native responsiveness after source updates, since reduced JS time does
  not guarantee reduced bridge or MapLibre processing time.

## Constraints and Non-Recommendations

- Do not add public OSM raster tile bulk prefetch or offline packs. The OSM tile
  usage policy requires local HTTP caching and prohibits bulk downloading and
  prefetch features on `tile.openstreetmap.org`.
- Do not use viewport-only geometry for gameplay decisions. The viewport is a
  rendering concern; eligibility must remain correct for the entire play area.
- Do not persist large derived geometry blobs without an algorithm version,
  source signature, byte budget, and measured benefit.
- Do not assume MapLibre React Native can patch individual source features
  because MapLibre GL JS can. Design stable IDs now, but verify the native API
  before relying on diff updates.
- Do not add an R-tree dependency before simple bbox comparisons are measured.
  The current station counts are small enough to start with a straightforward
  implementation.

## Primary References

- [MapLibre GL JS: Optimising MapLibre Performance for Large GeoJSON Datasets](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/)
- [MapLibre GL JS: `GeoJSONSource.updateData()`](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/#updatedata)
- [MapLibre React Native: GeoJSON Source](https://maplibre.org/maplibre-react-native/docs/components/sources/geo-json-source/)
- [Overpass API Manual: Bounding Boxes](https://dev.overpass-api.de/overpass-doc/en/full_data/bbox.html)
- [PostGIS: `ST_Intersects`](https://postgis.net/docs/ST_Intersects.html)
- [PostGIS Workshop: Spatial Indexing](https://postgis.net/workshops/postgis-intro/indexing.html)
- [RFC 5861: stale-while-revalidate and stale-if-error](https://www.rfc-editor.org/rfc/rfc5861)
- [Expo: Store Data](https://docs.expo.dev/develop/user-interface/store-data/)
- [OSMF: Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
- [RBush: JavaScript R-tree Spatial Index](https://github.com/mourner/rbush)
- [Node.js: Performance Measurement APIs](https://nodejs.org/api/perf_hooks.html)
