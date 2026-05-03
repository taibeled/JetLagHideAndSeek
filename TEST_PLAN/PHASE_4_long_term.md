# Phase 4: Long-Term Investment

## 13. Snapshot / Golden Tests for SID Stability

**Why**: Wire format changes can break existing shared URLs. Expanding `wire.fixture.test.ts`
pattern provides regression safety.

**New fixtures in `tests/fixtures/`**:
- `wire-radius.json` — single radius question, golden SID
- `wire-thermometer.json` — single thermometer question, golden SID
- `wire-same-train-line.json` — same-train-line with `selectedTrainLineId`, golden SID
- `wire-multi-question.json` — 3+ questions of mixed types, golden SID

**Test pattern** (same as existing `wire.fixture.test.ts`):
1. Parse fixture with `wireV1SnapshotSchema.parse()`
2. `canonicalize()` to sorted UTF-8
3. `computeSidFromCanonicalUtf8()` to derive SID
4. Assert SID matches golden value

## 14. Performance Benchmarks

**Why**: Large datasets (many questions, many stations, complex geometry) can degrade UX.

**New file**: `tests/benchmark.test.ts` (use `describe.skip` or a separate Vitest config):

| Benchmark | Input | Threshold |
|-----------|-------|-----------|
| `applyQuestionsToMapGeoData` with 10 questions | 10 matching questions on country-level geometry | <500ms |
| Station discovery with 500 stations | 500 station circles + 3 matching questions | <2s |
| `safeUnion` on 100 overlapping polygons | 100 random polygons in same area | <1s |
| `canonicalize` on full wire payload | Full snapshot with 10 questions + settings | <10ms |
| Coastline loading + processing | `coastline50.geojson` (~3.9 MB) | <1s parse |

## 15. Accessibility

**Why**: Known issue in AGENTS.md — Radix dialog missing `aria-describedby`.

When component test infra is set up (Playwright or RTL + jsdom), add:
- `@axe-core/react` or `jest-axe` configuration
- Running axe scan on the full page (TutorialDialog, OptionDrawers)
- Assert no violations (with known exceptions documented)

## 16. PWA Validation

**Why**: Service worker misconfiguration could break offline behavior or cache API routes.

**Approach**: Build-output assertions (no browser needed):
- `dist/sw.js` exists and imports `workbox-*.js`
- `dist/sw.js` contains `NetworkOnly` for `/api/cas/` and `/api/teams/`
- `dist/manifest.webmanifest` has valid `name`, `start_url`, `icons`
- Precache manifest includes key static assets (index.html, JS bundles)
