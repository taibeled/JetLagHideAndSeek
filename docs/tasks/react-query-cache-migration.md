# Design Doc: Adopt TanStack Query to Consolidate Cache Layers

**Date:** 2026-06-02
**Status:** Proposed
**Author:** Architecture review follow-up
**Related:** [`../caching-audit-2025-05-31.md`](../caching-audit-2025-05-31.md), [`../architecture-audit.md`](../architecture-audit.md)

## Summary

The app currently has **three independently hand-rolled async cache subsystems**, each
re-implementing the same concerns — in-flight request deduplication, TTL staleness,
stale-while-revalidate, LRU eviction, and AsyncStorage persistence. Together they are
roughly **900 lines** of bespoke caching plumbing, and each consumer component
separately re-implements loading/error state, debouncing, abort handling, and
generation-counter race protection.

This doc proposes adopting [TanStack Query](https://tanstack.com/query) (`@tanstack/react-query`)
as the unified async-state layer. TanStack Query provides dedup, stale-while-revalidate,
background refetch, retry/backoff, and request cancellation as first-class primitives,
and integrates with AsyncStorage for persistence. The migration is **phased**: the search
cache is a clean drop-in, the boundary cache is a good fit, and the OSM matching cache is
a **partial** fit that requires keeping a thin domain-specific layer for its spatial
containment logic.

The intent of this doc is to be honest about where the library helps and where it does
**not**, so the team can decide scope before writing code.

## Goals

- Remove duplicated cache machinery (dedup, TTL, SWR, LRU) in favour of one well-tested library.
- Standardize loading/error/stale state handling across consumer components via hooks.
- Get retry-with-backoff and request cancellation "for free" where today they are absent.
- Reduce surface area for the race-condition bugs each consumer currently guards against by hand.

## Non-Goals

- Replacing the app-state stores (`playAreaStore`, `hidingZoneStore`, `questionStore`).
  TanStack Query is a *server/async-cache* layer, not a client-state manager. The Context
  stores stay.
- Changing the network protocols (Overpass / Photon) or query construction.
- Eliminating the **spatial containment** matching in the OSM matching cache (see
  [The hard part](#the-hard-part-spatial-containment-does-not-map-to-key-based-caching)).
- Touching the synchronous startup-cost issues catalogued in the caching audit (bundled
  JSON parsing, first-render GeoJSON computation). Those are orthogonal.

## Current State

Three subsystems, each with overlapping but separately-implemented concerns:

| Subsystem | File | LOC | Key | Layers | TTL | SWR | Dedup | Disk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OSM matching | `src/features/questions/matching/osmMatchingCache.ts` | 533 | category + **spatial circle** | memory LRU (20) → manifest+disk → network | 90d | yes | yes (`inflight`) | yes (manifest + per-entry) |
| Play area boundary | `src/features/map/playAreaBoundary.ts` | 292 | `relationId` (number) | bundled → memory `Map` → AsyncStorage → Overpass | 30d | yes | yes (`boundaryRevalidations`) | yes (per-entry envelope) |
| Play area search | `src/features/playArea/playAreaSearch.ts` | 88 | normalized query string | memory LRU (50) | none | no | **no** | no |

Each consumer re-implements client-side coordination on top:

- `OsmMatchingQuestionDetailScreen.tsx` — manual `AbortController`, a `searchGenerationRef`
  counter to discard stale responses, a debounce timer, and `isLoading`/`error`/`cacheSource`
  `useState` (≈100 lines of effect/callback wiring, `OsmMatchingQuestionDetailScreen.tsx:40-160`).
- `PlayAreaScreen.tsx` — manual debounce timer + `isSearching`/`searchError` state
  (`PlayAreaScreen.tsx:38-67`).
- `playAreaStore.tsx` — calls `loadPlayAreaByRelationId` and tracks load state by hand.

**Observation:** the same five concerns (dedup, TTL, SWR, loading state, cancellation) are
written three to six times, inconsistently. The search cache has *no* dedup and *no*
cancellation at all (`playAreaSearch.ts:47`), so rapid typing fires redundant Photon
requests and can apply out-of-order responses.

## Why TanStack Query

TanStack Query gives, as configuration rather than code:

| Concern | Today | With TanStack Query |
| --- | --- | --- |
| In-flight dedup | hand-rolled `inflight` / `boundaryRevalidations` maps; absent in search | automatic per query key |
| TTL / staleness | manual `Date.now()` comparisons against per-module constants | `staleTime` / `gcTime` |
| Stale-while-revalidate | hand-written background revalidation functions | default behaviour |
| Retry + backoff | **absent everywhere** | `retry` / `retryDelay` |
| Cancellation | manual `AbortController` in one consumer | `signal` passed to `queryFn` |
| Loading/error state | `useState` in every consumer | `useQuery` return value |
| Disk persistence | manual manifest + AsyncStorage per subsystem | `persistQueryClient` + async-storage persister |
| Memory eviction | hand-tuned LRU sizes (20 / 50) | `gcTime`-driven garbage collection |

It is already compatible with React Native / Expo and the installed React 19 / RN 0.81.

## The hard part: spatial containment does not map to key-based caching

This is the central design tension and the reason this is a *phased* migration rather than
a wholesale replacement.

TanStack Query is **key-based**: a query is a pure function of its `queryKey`. Two requests
hit the same cache entry only if their keys are equal.

The OSM matching cache is **not** key-based. A cached result fetched at center `A` with
radius `R` serves a *different* request at center `B` with radius `r` whenever the request
circle is geometrically contained in the cached circle:

```
dist(A, B) + r <= R          // osmMatchingCache.ts:94-109 (containsSearchCircle)
```

The cache *scans* its entries (`findInMemory`, `findInManifest`) looking for any covering
circle, and fetches with a 1.5× overscan radius so nearby follow-up searches reuse the
result. This containment + overscan behaviour is the cache's whole value proposition for
panning the map — and it has **no native equivalent** in a key-equality cache.

There are three ways to reconcile this, in increasing fidelity:

1. **Grid quantization (recommended for phase 3).** Snap the request center to a coarse
   spatial grid cell and round the radius up to a bucket, then use `["osm-matching", category, cellX, cellY, radiusBucket]`
   as the query key. Nearby requests land in the same cell → same key → cache hit. This
   *approximates* containment with grid bucketing. Simpler, fully key-based, but loses the
   exact "any covering circle" reuse and can double-fetch near cell boundaries.
2. **Hybrid (highest fidelity).** Keep `containsSearchCircle` + the spatial scan as a thin
   resolver that maps an incoming request to an existing *canonical* query key, then let
   TanStack Query own dedup/SWR/persistence for that canonical key. Most of
   `osmMatchingCache.ts` deletes; the spatial index (~80 lines) stays.
3. **Leave OSM matching as-is.** Migrate only search + boundary; wrap the existing
   `findMatchingFeaturesWithCache` in a `useQuery` purely for loading-state ergonomics in
   the consumer, keeping the bespoke cache underneath.

**Recommendation:** ship phases 1–2 first (clean wins), then choose between hybrid (2) and
status-quo (3) for OSM matching after measuring how much complexity actually drops. Do not
attempt grid quantization (1) unless profiling shows the spatial scan is a real cost — it
trades correctness for a simplicity the hybrid already provides.

## Proposed Design

### Dependencies

```jsonc
"@tanstack/react-query": "^5",
"@tanstack/react-query-persist-client": "^5",   // phase 2+ (disk persistence)
"@tanstack/query-async-storage-persister": "^5" // phase 2+ (AsyncStorage adapter)
```

Phase 1 needs only the core package. The persister packages are added with phase 2.

### Provider setup

Add a `QueryClientProvider` near the root, above the existing app-state providers. The
natural home is `src/state/AppStateProviders.tsx` (or `app/_layout.tsx`).

```tsx
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 2,
            staleTime: 5 * 60 * 1000,      // overridden per query below
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,    // not meaningful on RN
        },
    },
});
```

### Phase 1 — Play area search (clean drop-in)

This is the purest fit: string key, no disk, no TTL, no spatial logic. It also *gains*
dedup and cancellation it does not have today.

Replace the module-level LRU in `playAreaSearch.ts` with a query. Keep
`mapPhotonFeaturesToPlayAreaResults` (pure, already unit-tested) as the `queryFn` body.

```tsx
// playAreaSearch.ts keeps fetchPhotonResults(query, signal) — pure fetch + map.
export function usePlayAreaSearch(query: string) {
    const trimmed = query.trim();
    return useQuery({
        queryKey: ["play-area-search", normalizeQuery(trimmed)],
        queryFn: ({ signal }) => fetchPhotonResults(trimmed, signal),
        enabled: trimmed.length > 0,
        staleTime: 60 * 60 * 1000, // place names are stable within a session
    });
}
```

`PlayAreaScreen.tsx` loses its debounce-timer + `isSearching`/`searchError`/`results`
state. Debounce the *input value* (a small `useDebouncedValue` hook) and feed it to the
query; `data` / `isFetching` / `error` come from the hook. Net: ~30 lines deleted in the
screen, the entire 88-line cache module reduced to a pure fetch + a hook.

### Phase 2 — Play area boundary (good fit, with persister)

Boundary is keyed cleanly by `relationId`. The bundled-boundary shortcut and the
durable-app-state coupling are the only wrinkles.

```tsx
export function usePlayAreaBoundary(relationId: number | null) {
    return useQuery({
        queryKey: ["play-area-boundary", relationId],
        queryFn: ({ signal }) => fetchPlayAreaBoundary(relationId!, signal),
        enabled: relationId != null && !isBundledPlayAreaId(relationId),
        staleTime: BOUNDARY_CACHE_TTL_MS, // 30d — SWR handled by the library
        initialData: relationId != null ? getBundledPlayArea(relationId) ?? undefined : undefined,
    });
}
```

- `getBundledPlayArea` becomes `initialData` (bundled boundaries are instant, never fetched).
- `memoryCache` + `boundaryRevalidations` + the manual `revalidateBoundaryIfStale` /
  `isBoundaryCacheEntryStale` machinery all delete — `staleTime` + the library's SWR
  replace them.
- `warmBoundaryCacheFromStorage` is replaced by the persister rehydrating the query cache
  on startup (see [Persistence](#persistence-strategy)).

**Coupling caveat:** `persistence.ts:83` and `ensurePlayAreaBoundaryCached` use the
boundary cache to avoid re-serializing huge boundary GeoJSON into durable app state. This
is a *correctness* dependency, not just a perf cache. The migration must preserve the
invariant that app-state restore can resolve a boundary by `relationId` without a network
call. With the persister this still holds (the query cache is on disk), but the validity
must be verified — see [Open Questions](#open-questions).

### Phase 3 — OSM matching (partial fit; hybrid)

Per [The hard part](#the-hard-part-spatial-containment-does-not-map-to-key-based-caching),
keep `containsSearchCircle` + the spatial scan as a small resolver that returns a
*canonical key* for an incoming `(category, center, radius)`. The resolver answers: "is
there an existing covering circle, and if so what key?" If yes → reuse that key; if no →
mint a new canonical key (with overscan) and let TanStack Query fetch + dedupe + persist
it.

```tsx
export function useMatchingCandidates(category, center, radiusMeters) {
    const canonical = resolveCanonicalCircle(category, center, radiusMeters); // spatial scan
    return useQuery({
        queryKey: ["osm-matching", category, canonical.key],
        queryFn: ({ signal }) =>
            fetchAndParseOverpassFeatures(category, canonical.center, canonical.radius, signal),
        staleTime: MATCHING_CACHE_TTL_MS, // 90d
        select: (features) => rankMatchingFeatures(features, center, maxCandidates),
    });
}
```

Deletes: the `memoryLru`, `inflight` map, manifest read-modify-write mutex, per-entry
disk plumbing, and the bespoke SWR path (≈400 of 533 lines). Keeps: `containsSearchCircle`,
`getOverscanRadius`, `rankMatchingFeatures`, and the new ~80-line resolver / spatial index.

`OsmMatchingQuestionDetailScreen.tsx` loses the `AbortController` ref, the
`searchGenerationRef` stale-response guard, and the manual loading/error `useState` — all
subsumed by `useQuery` (cancellation via `signal`, staleness via key changes). The
pin-moved-clears-candidates logic becomes a key change rather than manual state reset.

## Persistence Strategy

Use `persistQueryClient` with `createAsyncStoragePersister` (AsyncStorage adapter) instead
of three separate manual AsyncStorage schemes.

- **Persist** boundary and OSM-matching query caches (large, expensive, long TTL).
- **Do not persist** search results (cheap, session-scoped) — use a `shouldDehydrateQuery`
  predicate on the query key prefix.
- Set `maxAge` on the persister to bound on-disk staleness; per-query `staleTime` still
  governs refetch.
- **Migration of existing on-disk data:** the current keys
  (`osm-matching-cache:*`, `osm-matching-manifest`, `play-area-boundary:*`) will be
  orphaned. Either (a) ship a one-time cleanup that deletes the old keys, or (b) leave them
  to age out (they are bounded and TTL'd). Prefer (a) for cleanliness; it is a few lines in
  a startup effect.

## Migration & Rollout Plan

Phased, each phase independently shippable and testable:

1. **Phase 0 — Setup.** Add core package, mount `QueryClientProvider`, wire the jest setup
   to wrap render helpers in a test `QueryClientProvider`. No behaviour change.
2. **Phase 1 — Search.** Migrate `playAreaSearch` + `PlayAreaScreen`. Smallest blast radius,
   immediate dedup/cancellation win. Delete the LRU.
3. **Phase 2 — Boundary.** Add persister packages, migrate `playAreaBoundary` + consumers,
   verify the `persistence.ts` boundary-resolution invariant, add old-key cleanup.
4. **Phase 3 — OSM matching (decision gate).** Build the spatial resolver, migrate
   `osmMatchingCache` + `OsmMatchingQuestionDetailScreen`. Only proceed if phases 1–2
   validate the ergonomics; otherwise stop at phase 2 and leave matching as-is.

**Testing.** The existing suites are strong here — `osmMatchingCache.test.ts` (396 lines),
`playAreaSearch.test.ts`, boundary tests. Strategy:
- Keep the pure functions (`mapPhotonFeaturesToPlayAreaResults`, `rankMatchingFeatures`,
  `containsSearchCircle`, `getOverscanRadius`, conversion helpers) and their tests intact —
  they move, they do not change.
- Rewrite the cache-coordination tests as hook tests with a test `QueryClient`
  (`@testing-library/react-native` + a wrapper). Assert dedup, SWR, and cancellation via
  the library rather than against the deleted internals.
- The 4 currently-failing tests (see test-coverage analysis) are unrelated fixture drift;
  fix separately, do not entangle with this migration.

## Risks & Tradeoffs

- **Bundle size.** TanStack Query core is ~12-13 KB gzipped; persister adapters add a little
  more. Acceptable, and offset by ~900 lines of deleted app code.
- **Spatial fidelity (phase 3).** The hybrid preserves containment exactly; grid
  quantization (if ever chosen) would not. Documented as a deliberate decision gate.
- **Persistence coupling.** The boundary cache feeds durable app-state restoration. The
  persister must guarantee boundary-by-`relationId` resolves offline after restart. This is
  the single correctness risk and must be verified in phase 2 before phase 3.
- **Learning curve.** The team is currently on plain Context + bespoke caches. TanStack
  Query introduces new mental model (query keys, stale/gc time, invalidation). Mitigated by
  the phased rollout starting with the trivial search case.
- **Two state paradigms.** Context stores for client state + TanStack Query for async state
  is the *intended* split, but it must be documented so contributors do not put server data
  in Context or client data in queries.

## Open Questions

1. Does the persister reliably rehydrate the boundary cache *before* `persistence.ts` needs
   it during app-state restore, or is there a race? (Determines whether phase 2 needs an
   explicit `await persistQueryClient` gate at startup.)
2. For phase 3, is the hybrid spatial resolver worth the remaining ~80 lines, or does
   leaving `findMatchingFeaturesWithCache` intact under a thin `useQuery` wrapper capture
   90% of the ergonomic win at 10% of the risk?
3. Should old on-disk cache keys be actively cleaned up (one-time migration) or left to
   TTL-expire?

## Effort Estimate

| Phase | Scope | Estimate |
| --- | --- | --- |
| 0 | Setup + provider + test harness | ~0.5 day |
| 1 | Search migration | ~0.5 day |
| 2 | Boundary migration + persister + invariant verification | ~1.5 days |
| 3 | OSM matching hybrid + consumer rewrite | ~2-3 days |
| — | Test rewrites across phases | ~1 day |

Phases 1–2 (the clean wins) are ~2.5 days and deletable independently of the harder phase 3.

## Appendix: Code Deletion Inventory

Approximate lines removed if all phases land:

- `osmMatchingCache.ts`: ~400 of 533 (keep spatial math + ranking + resolver).
- `playAreaBoundary.ts`: ~150 of 292 (keep fetch + bundled lookup + conversion).
- `playAreaSearch.ts`: ~50 of 88 (keep pure fetch + mapping).
- Consumer wiring (`OsmMatchingQuestionDetailScreen`, `PlayAreaScreen`, `playAreaStore`):
  ~150 lines of manual debounce / abort / generation / loading-state.

Net: roughly **−750 app lines**, **+~30 KB gzipped dependency**, plus one consistent async
model across the app.
