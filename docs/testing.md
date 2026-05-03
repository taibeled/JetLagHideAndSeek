# Testing Guide

## Test Architecture

The project has three test suites:

| Suite | Runner | Location | Scope | Command |
|-------|--------|----------|-------|---------|
| Frontend unit/integration | Vitest | `tests/`, `src/**/*.test.ts` | Pure functions, stores, schemas, CAS client, pipelines | `pnpm test` |
| Server integration | Vitest | `server/tests/` | Fastify routes, SID computation, blob CRUD, teams | `pnpm --dir server test` |
| E2E | Playwright | `e2e/` | Full browser, Overpass mocking, same-train-line matching | `pnpm test:e2e` |

Vitest configs (`vitest.config.ts` root and `server/vitest.config.ts`) ensure frontend and server tests are isolated. The root config excludes `server/` and `e2e/` directories. Playwright uses `playwright.config.ts` with the `webServer` option to launch `pnpm start:app`.

## Running Tests

```bash
# All frontend tests
pnpm test

# Specific file
pnpm vitest tests/wire.test.ts

# Server tests
pnpm --dir server test

# E2E (requires Chromium: npx playwright install chromium)
pnpm test:e2e

# E2E with UI
pnpm test:e2e -- --ui

# E2E specific file
pnpm test:e2e -- e2e/fukutoshin-regression.spec.ts
```

The E2E `webServer` config launches `pnpm start:app` automatically. Set `reuseExistingServer` to skip the build step during iterative development — start the app in another terminal and run `pnpm test:e2e`.

## Test Patterns

### Import Aliases

Frontend tests use the `@/` alias (maps to `src/`). Server tests use relative imports with `.js` extensions. Playwright helpers inline canonicalization rather than importing from `src/`.

### Atom Seeding

Import stores from `@/lib/context`, set seed values before the test, and reset in `afterEach`:

```ts
import { casServerStatus, questions } from "@/lib/context";
import { afterEach } from "vitest";

afterEach(() => {
  casServerStatus.set("unknown");
  // reset other atoms as needed
});

it("example", () => {
  questions.set([/* seed questions */]);
  // test logic
});
```

### localStorage Mocking (Nanostores Persistent)

For tests involving `persistentAtom`, use `@nanostores/persistent`'s test storage engine. Must be called **before** any persistent atom is created:

```ts
import { getTestStorage, useTestStorageEngine } from "@nanostores/persistent";

useTestStorageEngine(); // call before importing context

it("saves presets", async () => {
  const mod = await import("@/lib/context");
  mod.customPresets.set([]);
  // ... test logic
  const raw = getTestStorage()["customPresets"];
  expect(raw).toBeTruthy();
});
```

To pre-populate storage for recovery tests:

```ts
it("recovers from pre-populated storage", async () => {
  getTestStorage()["customPresets"] = JSON.stringify([{/*...*/}]);
  vi.resetModules();
  const mod = await import("@/lib/context");
  // atoms will initialize from pre-populated test storage
});
```

### Fastify Integration Tests

Server tests build a real Fastify instance with a temp data directory, then call `app.inject()`:

```ts
import { buildApp } from "../src/app.js";

let app: Awaited<ReturnType<typeof buildApp>>;
let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "test-"));
  app = await buildApp({ dataDir, /* ... */ });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

it("PUT and GET roundtrip", async () => {
  const putRes = await app.inject({
    method: "PUT",
    url: `/api/cas/blobs/${sid}`,
    headers: { "content-type": "text/plain; charset=utf-8" },
    payload: compressedPayload,
  });
  expect(putRes.statusCode).toBe(200);

  const getRes = await app.inject({ method: "GET", url: `/api/cas/blobs/${sid}` });
  expect(getRes.statusCode).toBe(200);
});
```

### SID Computation in Tests

SIDs are always derived at runtime — never hardcode them:

```ts
// Server tests (Node crypto)
import { canonicalize, wireV1SnapshotSchema } from "../src/wire.js";
import { computeSidFromCanonicalUtf8 } from "../src/sid.js";

const snap = wireV1SnapshotSchema.parse(JSON.parse(rawFixture));
const canonicalUtf8 = canonicalize(snap);
const sid = computeSidFromCanonicalUtf8(canonicalUtf8);

// Playwright helpers (e2e/helpers.ts)
import { buildCasBlob } from "./helpers";
const { sid, compressedPayload } = await buildCasBlob(snapshot);
```

### Golden SID Tests

Wire fixtures in `tests/fixtures/` have companion `.sid.txt` files containing expected SIDs. These tests verify that wire serialization remains stable across code changes:

```ts
it("wire-v1 produces deterministic SID", () => {
  const raw = readFileSync(join(__dirname, "../fixtures/wire-v1.json"), "utf8");
  const snap = wireV1SnapshotSchema.parse(JSON.parse(raw));
  const sid = computeSidFromCanonicalUtf8(canonicalize(snap));
  const expected = readFileSync(join(__dirname, "../fixtures/wire-v1.sid.txt"), "utf8").trim();
  expect(sid).toBe(expected);
});
```

## E2E Test Conventions

See [testing-mocks.md](./testing-mocks.md) for the full mock strategy guide.

Key points:
- **URL resolution:** `use.baseURL` is `/JetLagHideAndSeek/`. Use relative paths for `page.goto()` to preserve the prefix (e.g., `page.goto("?sid=" + sid)`).
- **PWA state:** Clear before each test via `clearPwaState(page)`. Clears localStorage, sessionStorage, caches, and unregisters service workers — all in-browser in a single `page.evaluate()`.
- **CAS seeding:** Use `seedOrMockCasBlob(sid, payload)` before navigating to the SID URL.
- **Overpass mocking:** Install `page.route()` handlers before navigating. Match by decoded `?data=` URL param fragments, not URL-encoded strings.
- **SIDs:** Computed at runtime via `buildCasBlob()`. Never hardcoded.
- **data-testid:** Add sparingly. Prefer `getByRole`, `getByText`, `getByLabel`.

## Adding a New Test

**For frontend unit tests:**
1. Add the test file to `tests/` or co-locate with the source under `src/`
2. Use Vitest conventions (`describe`, `it`, `expect`)
3. Import from `@/lib/context` for state, `@/lib/wire` for wire operations
4. Reset atoms in `afterEach` to avoid cross-test contamination

**For server tests:**
1. Add to `server/tests/`
2. Build the app in `beforeEach` with a temp directory
3. Tear down in `afterEach` with `app.close()` and `rm()`
4. Use `.js` extensions for imports

**For E2E tests:**
1. Add to `e2e/`
2. Seed CAS blobs before navigation, install Overpass mocks before navigation
3. Use the helpers from `e2e/helpers.ts`
4. Add fixtures to `e2e/fixtures/` for Overpass responses
5. See [testing-mocks.md](./testing-mocks.md) for the full mock workflow

## Known Gotchas

- **Coordinate order:** Leaflet uses `[lat, lng]`; GeoJSON and Turf use `[lng, lat]`.
- **Glob vs exact URL matching:** Playwright `page.route("https://...", handler)` uses glob matching. Add `**` to match query strings: `"https://...**"`.
- **`clearLocalStorage`:** Must run in-browser via `page.evaluate()`. Can't serialize opaque objects like `ServiceWorkerRegistration` across the Node/browser boundary.
- **Atom persistence:** `persistentAtom` writes to `localStorage` on set. Use `@nanostores/persistent` test engine to avoid real localStorage.
- **Module mocking order:** `vi.mock()` is hoisted. Use `vi.hoisted()` for module-level variables used inside `vi.mock()` factories.
