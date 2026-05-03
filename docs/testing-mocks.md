# Testing Mock Strategies

## Overview

This project uses six distinct mock strategies depending on the test context.
This document covers each in detail with patterns, pitfalls, and examples.

| Strategy | Context | Library |
|----------|---------|---------|
| [Fetch mocking](#fetch-mocking) | Frontend unit tests | `vi.stubGlobal` / `vi.mock` |
| [localStorage mocking](#localstorage-mocking) | Frontend unit tests | `@nanostores/persistent` test engine |
| [Atom seeding](#atom-seeding) | Frontend unit tests | `atom.set()` + `afterEach` reset |
| [Fastify inject](#fastify-inject) | Server integration tests | `buildApp()` + `app.inject()` |
| [Overpass mocking (Playwright)](#overpass-mocking-playwright) | E2E tests | `page.route()` + fixture files |
| [CAS blob seeding (Playwright)](#cas-blob-seeding-playwright) | E2E tests | `PUT /api/cas/blobs/:sid` |

---

## Fetch Mocking

### Simple: `vi.stubGlobal`

For tests where a single `fetch` call is made:

```ts
import { vi } from "vitest";

it("putBlob sends correct request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    await putBlob("https://example.com", "payloadB64", "some-sid-123456");

    expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/api/cas/blobs/some-sid-123456",
        expect.objectContaining({
            method: "PUT",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
            body: "payloadB64",
        }),
    );
});
```

### Module-level: `vi.mock` + `vi.hoisted`

For tests where multiple functions from the same module need mocking:

```ts
const { putBlobMock } = vi.hoisted(() => ({
    putBlobMock: vi.fn(),
}));

vi.mock("@/lib/cas", async () => {
    const actual = await vi.importActual<typeof import("@/lib/cas")>("@/lib/cas");
    return { ...actual, putBlob: putBlobMock };
});
```

**Pitfalls:**
- `vi.mock()` is hoisted above imports. Use `vi.hoisted()` for variables referenced inside the factory.
- Stubs persist across tests in the same file unless reset with `mockReset()` or `mockRestore()`.
- `vi.stubGlobal("fetch", ...)` needs `vi.unstubAllGlobals()` in `afterEach` to avoid leaking.

---

## localStorage Mocking

For tests involving `persistentAtom` from `@nanostores/persistent`:

```ts
import { getTestStorage, useTestStorageEngine } from "@nanostores/persistent";

// Call BEFORE any persistentAtom is created
useTestStorageEngine();

describe("customPresets", () => {
    it("saves to test storage", async () => {
        const mod = await import("@/lib/context");
        mod.customPresets.set([]);
        mod.saveCustomPreset({ name: "Test", type: "custom", data: { x: 1 } });

        const raw = getTestStorage()["customPresets"];
        expect(raw).toBeTruthy();
    });

    it("recovers from pre-populated storage", async () => {
        getTestStorage()["customPresets"] = JSON.stringify([
            { name: "Preloaded", type: "custom", data: {} },
        ]);
        vi.resetModules(); // force re-import so atoms re-init from storage
        const mod = await import("@/lib/context");
        expect(mod.customPresets.get()[0]!.name).toBe("Preloaded");
    });
});
```

**Pitfalls:**
- `useTestStorageEngine()` must be called at module level, **before** any `persistentAtom` is created. Importing `@/lib/context` creates persistent atoms, so defer the import with dynamic `import()`.
- Use `vi.resetModules()` + dynamic re-import when testing recovery from different storage states.
- `getTestStorage()` returns a mutable object. Modifications persist until cleared.

---

## Atom Seeding

Import the atom, call `.set()` with seed data, and reset in `afterEach`:

```ts
import { afterEach } from "vitest";
import { casServerStatus, casServerEffectiveUrl, questions } from "@/lib/context";

afterEach(() => {
    casServerStatus.set("unknown");
    casServerEffectiveUrl.set(null);
    // Always reset every atom you touch
});

it("example", async () => {
    questions.set([
        { id: "radius", key: 0, data: { lat: 0, lng: 0, drag: false, radius: 10 } },
    ]);
    casServerStatus.set("available");

    // ... test logic that reads these atoms
});
```

**Pitfalls:**
- Atoms are global singletons. Always reset in `afterEach` to avoid cross-test contamination.
- `persistentAtom.set()` also writes to `localStorage`. Use the test storage engine (see above) if you need clean storage.
- Some atoms have computed dependencies. Check `context.ts` for `computed()` atoms that derive from your seeded atoms.

---

## Fastify Inject

Server tests build a real Fastify instance with temporary storage:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("CAS blobs API", () => {
    let dataDir: string;
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeEach(async () => {
        dataDir = await mkdtemp(join(tmpdir(), "test-"));
        app = await buildApp({
            dataDir,
            maxCanonicalBytes: 1024 * 1024,
            maxCompressedBodyBytes: 2 * 1024 * 1024,
        });
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
        await rm(dataDir, { recursive: true, force: true });
    });

    it("PUT rejects mismatched SID", async () => {
        const res = await app.inject({
            method: "PUT",
            url: "/api/cas/blobs/AAAAAAAAAAAAAAAAAAAAAA", // wrong SID
            headers: { "content-type": "text/plain; charset=utf-8" },
            payload: compressedPayload,
        });
        expect(res.statusCode).toBe(400);
    });
});
```

`app.inject()` returns a `Response`-like object with `statusCode`, `body`, `headers`, and `json()`. It does not make real HTTP calls — it injects directly into the Fastify router.

**Pitfalls:**
- Always close the app and remove the temp directory. Leaked temp dirs accumulate on disk.
- The `maxCanonicalBytes` / `maxCompressedBodyBytes` settings must be large enough for your test payloads.
- Server tests use `.js` extensions in imports (compiled output convention).

---

## Overpass Mocking (Playwright)

The app queries Overpass via GET requests like:

```
https://overpass-api.de/api/interpreter?data=%5Bout%3Ajson%5D%3B...
```

### Route Installation

Use `mockOverpass()` from `e2e/helpers.ts`:

```ts
import { mockOverpass, overpassRoute } from "./helpers";

const overpass = await mockOverpass(page, [
    // Most specific contracts first
    overpassRoute("fukutoshin-nearest-station.json", ["1951953898"]),
    overpassRoute("fukutoshin-exact-line.json",     ["5375678"]),
    overpassRoute("fukutoshin-line-options.json",    ["around:300"]),
    overpassRoute("fukutoshin-station-discovery.json", [
        "[railway=station]",
        "[railway=stop]",
    ]),
]);
```

### How Route Matching Works

1. `mockOverpass()` registers `page.route()` for both Overpass API URLs using `**` glob patterns to match query strings.
2. For each intercepted request, it extracts the decoded `?data=` query parameter.
3. Contracts are tested **in order** — the first match wins.
4. The `matchOverpassQuery(fragments)` function checks if all `fragments` are substrings of the decoded query.
5. If no contract matches, the request passes through to the real Overpass API.

### Fragment Matching

Fragments are plain substrings matched against the decoded Overpass QL query string after `decodeURIComponent()`. Examples:

| Fragment | Would match |
|----------|-------------|
| `1951953898` | `node(1951953898);out body;` |
| `5375678` | `relation(5375678)->.line;` |
| `around:300` | `rel(around:300,35.7,139.7)[route~...]` |
| `[railway=station]` | `node["railway"="station"]` — **won't match** because of quotes |

**Important:** The fragment `[railway=station]` does NOT match `["railway"="station"]` because the quotes differ. The app's exact-line query uses quoted form, while station discovery uses the raw form. This prevents cross-contamination between contracts.

### Contract Ordering

Contracts are tested in the order they appear in the array. Place more specific contracts first:

```
1. Most specific (e.g., concrete node IDs) 
2. Semi-specific (e.g., geographic radius queries)
3. Broad (e.g., tag-based filters matching many queries)
```

### Asserting Calls

The returned `OverpassMock` records every intercepted call:

```ts
// Assert a relation was queried
overpass.assertCalledRelation("5375678");

// Assert a way was NOT queried
overpass.assertNotCalledWay("682766005");
```

These check the decoded `?data=` param (the actual Overpass QL query), not the fixture content.

### Delayed Responses

Use the `delay` option to test loading states:

```ts
overpassRoute("line-expansion-minimal.json", ["relation(100)"], 800);
```

This adds an 800ms delay before fulfilling, allowing the test to assert "Loading stations..." text:

```ts
await expect(page.getByText("Loading stations...")).toBeVisible();
await expect(page.getByText("Stations matched: 3")).toBeVisible({ timeout: 10000 });
```

### Creating Fixtures

Overpass fixtures are JSON files in `e2e/fixtures/`. Each is a standard Overpass API response:

```json
{
  "version": 0.6,
  "elements": [
    { "type": "node", "id": 1001, "lat": 35.0, "lon": 139.0, "tags": { "railway": "station", "name": "Station Alpha" } }
  ]
}
```

To capture a fixture from the real Overpass API:

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data-urlencode 'data=[out:json];relation(5375678);(._;>>;);out geom;' \
  -o e2e/fixtures/your-fixture.json
```

Hand-crafted fixtures should include only the OSM elements the test needs. Keep them minimal.

### Known Overpass Queries in the App

| Purpose | Query pattern | Key fragments |
|---------|---------------|---------------|
| Station discovery | `node[...][...](bbox);` | `[railway=station]`, operator/network tags |
| Nearest station body | `node(id); out body;` | Numeric node ID |
| Line options | `rel(around:300,lat,lon)[route~...]; way(around:100,...)[...];` | `around:300`, `route~` |
| Exact line expansion | `relation(id)->.line; way(r.line)->...; node(w.lineWays)...` | Numeric relation ID |
| Auto-detect fallback | `node(id); wr(bn); out tags;` | Node ID + `wr(bn)` |

---

## CAS Blob Seeding (Playwright)

### Building a Blob

```ts
import { buildCasBlob } from "./helpers";

const snapshot = {
    v: 1,
    type: "Feature",
    geometry: { type: "Point", coordinates: [139.0, 35.0] },
    properties: {
        /* ... full wire-v1 payload including questions, options, etc. */
    },
};

const { sid, compressedPayload } = await buildCasBlob(snapshot);
```

`buildCasBlob()` does:
1. Validates against the wire-v1 schema
2. Canonicalizes (deep key sort, strip undefined, JSON.stringify)
3. Computes SHA-256 → first 16 bytes → base64url SID
4. Deflates and base64url-encodes the canonical payload

### Seeding

```ts
import { seedOrMockCasBlob } from "./helpers";

await seedOrMockCasBlob(sid, compressedPayload);
```

This sends a real `PUT /api/cas/blobs/:sid` to the running server. The server validates the SID matches the payload, then stores it. No mock is needed — the real CAS serves the blob on subsequent `GET` requests.

### Using the SID

After seeding, navigate the app to the shared URL:

```ts
await page.goto("?sid=" + sid);
// App hydrates from CAS blob, restores full state
```

**Pitfalls:**
- The server must be running and reachable on `http://localhost:8787`.
- The snapshot must be a valid wire-v1 envelope (`{ v: 1, ... }`). Invalid snapshots will fail schema validation.
- SIDs are deterministic for the same input — this is tested in C12.

---

## PWA State Cleardown (Playwright)

Before each E2E test, clear all PWA state:

```ts
import { clearPwaState } from "./helpers";

await page.goto("/JetLagHideAndSeek/");
await clearPwaState(page);
```

`clearPwaState()` runs a single `page.evaluate()` that clears:
- `localStorage`
- `sessionStorage`
- All Cache Storage caches (via `caches.delete()`)
- All service worker registrations (via `navigator.serviceWorker.getRegistrations()` → `unregister()`)

**Why a single `page.evaluate()`?** `ServiceWorkerRegistration` objects cannot be serialized across the Node/browser boundary. Everything must run in the browser context.
