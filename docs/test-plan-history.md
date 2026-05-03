# Test Plan Historical Summary

The `TEST_PLAN/` directory contained the planning, implementation tracking, and review
artifacts for a multi-phase initiative to add comprehensive test coverage to the
project. All phases have been completed and the directory has been retired.
This document summarizes what was done.

## Phases Completed

| Phase | Scope | Result |
|-------|-------|--------|
| 1 | Critical risk: live sync, CAS client, question pipelines, question-type logic | 83 new tests |
| 2 | Important coverage: server API edges, state hydration, presets CRUD, wire roundtrip | Additional tests |
| 3 | Quick wins: schema roundtrip, utilities, station/label helpers, server units | Additional tests |
| 4 | Long-term: golden SID snapshots, benchmarks (skipped), accessibility (deferred), PWA | 4 wire fixtures + golden SIDs |
| 5 | Playwright E2E: 13 same-train-line tests including C13 Fukutoshin regression | 13 E2E tests, 11 fixture files |

## Final Test Counts

- **Frontend unit/integration (Vitest):** 224 tests passing
- **Server integration (Vitest):** 30 tests passing
- **E2E (Playwright):** 13 tests (requires `pnpm start:app`)

## Key Architectural Decisions (from Phase 5)

| Decision | Rationale |
|----------|-----------|
| Overpass mocked by query-structure fragments, not URL | URL-encoded strings fragile across environments |
| SIDs derived at runtime from canonicalize() | Never hardcode derived data; fixture snapshot is source of truth |
| CAS blob seeding via real PUT | Exercises full stack; no mock server needed |
| No data-testid unless getByRole/getByText can't reach | Lean; follows Testing Library philosophy |
| PWA state cleared fully before each test | localStorage + sessionStorage + CacheStorage + service workers |

## Mock Patterns Established

1. **fetch mocking** — `vi.spyOn(globalThis, "fetch")` with `mockResolvedValue`
2. **localStorage mocking** — `vi.stubGlobal("localStorage", mockStore)`
3. **atom seeding** — `atom.set(value)` before test, reset in `afterEach`
4. **Fastify inject** — `app.inject({ method, url, payload })` for server tests
5. **Playwright page.route()** — Overpass GET interception with glob patterns and fragment-based matching
6. **CAS blob seeding** — `PUT /api/cas/blobs/:sid` before navigation

## Review Bug Fixes

- **URL resolution:** `page.goto("/")` resolves to origin, not base path — use relative URLs or full `/JetLagHideAndSeek/` paths
- **Overpass routes:** Must use `**` glob pattern to match query strings
- **calls recording:** Must extract `?data=` param, not empty `postData()` from GETs
- **SW unregistration:** Must run entirely in-browser via single `page.evaluate()`, not serialize registrations to Node
