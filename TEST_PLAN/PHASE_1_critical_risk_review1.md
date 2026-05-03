# Phase 1 Critical Risk Review 1

Review target: outstanding Phase 1 test-plan/code changes, especially
`TEST_PLAN/PHASE_0_overview.md` and `TEST_PLAN/PHASE_1_critical_risk.md`.

Verification run:

```bash
pnpm test --run
```

Result: all frontend tests passed. The existing suite still logs `caches is not defined`
and Overpass network noise from `tests/questionsPersistenceLoad.test.ts`; those logs did
not fail the run.

## Findings

### 1. [P2] Live sync tests trigger uploads from init, not the claimed state change

File: `tests/liveSync.test.ts:116`

These tests mutate `questions`, but `initLiveSync()` only subscribes to `hidingZone`,
`casServerStatus`, and `liveSyncEnabled`. Nanostores call subscribers immediately on
subscribe, so the upload can be scheduled by `initLiveSync()` itself before the later
`questions.set(...)`.

That makes several assertions false positives: removing the `hidingZone` subscription
could still leave these tests green if another immediate subscription schedules the
upload. Mutate `hidingZone` after clearing any init-time scheduled work, or assert the
watched atom explicitly.

### 2. [P3] Root deploy behavior is documented backwards

File: `TEST_PLAN/PHASE_1_critical_risk.md:54`

The plan says the root deploy probes both `origin` and `origin/`, but `casDiscovery.ts`
turns `BASE_URL="/"` into an empty base path and then dedupes candidates, so only
`origin` is probed.

The new test already asserts one probe, so the prose should be corrected or future
implementers will chase the wrong contract.

### 3. [P3] Extra argument does not match client signature

File: `tests/cas.test.ts:209`

`listTeamSnapshots` only accepts `(serverBaseUrl, teamId)`, so this invalid-team
assertion has a stray third `sid` argument. Vitest runs it fine at runtime, but the repo
tsconfig includes tests via `**/*`, so this is a type-checking footgun and should be
removed.
