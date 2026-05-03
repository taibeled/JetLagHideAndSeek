# TODO: E2E / Component Tests — Train Line Dropdown

These test cases require browser automation (Playwright) or React component testing
(React Testing Library). Neither is currently set up in this codebase.

---

## Required Infrastructure

1. **Playwright** (E2E, full browser) or **React Testing Library + jsdom** (component tests)
2. **Overpass API mocking** — network intercept layer so tests don't hit live Overpass
3. **CAS server mock** or in-memory Fastify instance for sharing/load scenarios
4. **Nanostores reset/seed helpers** to prime state before each test

---

## Test Cases

### C1: Dropdown populates with lines from nearest station

| Step | Expected |
|------|----------|
| Add a "same-train-line" matching question centered near Shinjuku-sanchome | Question card appears |
| Unlock the question | Train line dropdown is enabled |
| Open the train line dropdown | Dropdown shows "(auto-detect from nearest station)" + one entry per line (no duplicates, no route_master) |
| Verify no direction noise in labels | Labels like "Fukutoshin Line" not "Fukutoshin Line (Wakoshi --> Shibuya)" |

### C2: Selecting a line updates the station preview

| Step | Expected |
|------|----------|
| With question unlocked, open dropdown and select a specific line | Dropdown closes, shows selected line name |
| Wait for station preview to load | "Stations matched: N" shows N > 0 |
| Scroll the station list | All stations visible, scrollable pane works |
| Select "auto-detect" | Preview updates to show auto-detect stations |

### C3: Station preview handles empty results

| Step | Expected |
|------|----------|
| Select a line that has no station nodes in the loaded area | "No stations found for this line" displayed |
| Count shows "Stations matched: 0" | |

### C4: Station preview shows "Loading stations..." during fetch

| Step | Expected |
|------|----------|
| Select a line while Overpass calls are slow (simulate network delay) | "Loading stations..." shown | 
| Fetch completes | Text changes to "Stations matched: N" with list |

### C5: Selected line clears when pin moves to incompatible station

| Step | Expected |
|------|----------|
| Select a line specific to current station | Line shown in dropdown |
| Move seeker pin to a station on a different line's network | Dropdown resets to "(auto-detect from nearest station)" |
| `selectedTrainLineId` is undefined | Station preview shows auto-detect results |

### C6: Loading state shows in dropdown trigger

| Step | Expected |
|------|----------|
| Unlock question fresh after pin move | Dropdown trigger shows "Loading train lines..." |
| Overpass call completes | Trigger shows "(auto-detect from nearest station)" or selected line |

### C7: Locked question preserves selection display

| Step | Expected |
|------|----------|
| Select a line, lock the question | Dropdown shows the line name, disabled |
| Result toggle (Same/Different) is disabled | Cannot change |
| Reload from same shared URL | Line selection preserved in dropdown |

### C8: Backward compatibility — legacy same-train-line without selection

| Step | Expected |
|------|----------|
| Load a shared URL with a same-train-line question that has no `selectedTrainLineId` | Dropdown shows "(auto-detect from nearest station)" |
| Result is computed by `trainLineNodeFinder` auto-detect | Correct behavior |

### C9: Hiderification with selected line

| Step | Expected |
|------|----------|
| Set hider location | |
| Select a specific train line in the matching question | |
| Click Hider Mode | Question computes `same` based on `findNodesOnTrainLine(selectedTrainLineId)` |
| Result toggle updates | Correct yes/no answer |

### C10: ZoneSidebar filters hiding zones with selected line

| Step | Expected |
|------|----------|
| Enable "Display hiding zones" | |
| Add a same-train-line question with a specific line selected and `same=true` | |
| Trigger station discovery | Only stations on the selected line shown in hiding zone |
| ZoneSidebar count reflects filtered count | |

### C11: Custom-only station list with selected line

| Step | Expected |
|------|----------|
| Enable "Use custom station list", disable "Include default stations" | |
| Select a line in the matching question | Warning toast: "'Same train line' isn't supported with custom-only station lists; skipping this filter." |
| ZoneSidebar filtering is skipped | |

### C12: Wire serialization with selectedTrainLineId

| Step | Expected |
|------|----------|
| Create state with same-train-line question + selected line | |
| Share via CAS (`sid=` URL) | |
| Load shared URL in fresh browser | `selectedTrainLineId` and `selectedTrainLineLabel` survive round-trip |
| SID is deterministic | Same state = same SID |

### C13: Regression — auto-detected Fukutoshin Line from Higashi-shinjuku

Fixture: [`TEST_PLAN/playwright-same-train-line-fukutoshin-fixture.json`](playwright-same-train-line-fukutoshin-fixture.json)

This covers the bug where the nearest station was Higashi-shinjuku, but auto-detection selected only a station/platform way and the preview showed only `東新宿` instead of all Fukutoshin Line stations.

#### Why Playwright

This is worth an E2E regression because the failure spans several layers:

- loading a shared CAS `sid`
- hydrating a locked `same-train-line` matching question
- station discovery populating `trainStations`
- Overpass train-line option discovery
- exact train-line expansion through stop positions and stop areas
- preview rendering in the React question card
- hiding-zone station filtering in `ZoneSidebar`

Keep the lower-level Vitest coverage for parsing and query behavior, but use Playwright to prove the browser workflow still behaves like the repro.

#### Test Setup

1. Start the built stack with `pnpm build:all` then `pnpm start:stack`.
2. Use a fresh browser context. Clear `localStorage`, `sessionStorage`, Cache Storage, and service worker registrations before navigating so stale PWA assets do not affect the result.
3. Route/mock Overpass requests. Do not hit live Overpass in CI.
4. Do not rely on the historical repro SID being present in CAS. `uREYiIub6Krlp5ygVDNwKQ` is useful only as a human repro pointer for the current data directory.
5. Build the test SID from the fixture’s `portableSeedSnapshot` at runtime:
   - canonicalize it with the app/server sorted-key canonicalizer
   - compute the SID from the canonical UTF-8 payload
   - deflate + base64url encode the canonical payload
   - either `PUT /api/cas/blobs/:computedSid` into the local CAS server, or route/mock `GET /api/cas/blobs/:computedSid` to return the encoded payload
6. Navigate to `/JetLagHideAndSeek/?sid=<computedSid>`.
7. If the “Replace current game state?” dialog appears, click `Replace`. If the tutorial appears in a fresh profile, click `Skip Tutorial`.

Portability rule: the fixture snapshot is the test source of truth; the SID is derived data. Never hard-code the derived SID in assertions because changes to canonical fixture fields intentionally change it.

#### Overpass Mocks

Use the fixture’s `overpassMockContract` as the mock checklist. The important mocked responses are:

- station discovery for the Tokyo Metro daypass area, including the Fukutoshin stations in the app’s station list
- `node(<closest Higashi-shinjuku node>); out body;`, returning `ref=F12`
- nearby route lookup around Higashi-shinjuku, returning both `relation/5375678` (Tokyo Metro Fukutoshin Line, `ref=F`) and at least one nearby non-F route such as Oedo
- exact `relation(5375678)` expansion, including both `stop_position` nodes and `railway=station` nodes reachable via `public_transport=stop_area`

The exact-line response should intentionally include the OSM shape that caused the bug: stop positions and station nodes are separate IDs. The app should still dedupe the user-facing station labels to exactly 16 stations.

#### Assertions

| Step | Expected |
|------|----------|
| Load the computed shared SID | Questions sidebar contains one same-train-line matching card |
| Wait for closest station resolution | Closest station is `東新宿` / Higashi-shinjuku |
| Wait for train-line fetches | Train line trigger remains auto-detect or resolves through auto-detect without selecting a platform way |
| Wait for station preview | Preview shows `Stations matched: 16` |
| Inspect station preview text | Includes all fixture `expectedStationsInCodeOrder` names; at minimum assert `和光市`, `地下鉄成増`, `東新宿`, `新宿三丁目`, `明治神宮前〈原宿〉`, and `渋谷` |
| Inspect station preview text | Does not show duplicate labels |
| Inspect station preview text | Does not collapse to only `東新宿` |
| Inspect network mock usage | Exact line expansion used `relation/5375678`, not `way/682766005` or another station/platform way |
| Inspect Hiding Zone sidebar after filtering | Visible station suggestions/count include the deduped same-line result set, not only Higashi-shinjuku |

#### Suggested Playwright Shape

```ts
test("same-train-line auto-detect expands Fukutoshin stations from Higashi-shinjuku", async ({ page }) => {
  await clearPwaState(page);
  const { sid, compressedPayload } = await buildCasBlob(fixture.portableSeedSnapshot);
  await seedOrMockCasBlob(page, sid, compressedPayload);
  await mockOverpass(page, fixture.overpassMockContract);

  await page.goto(`/JetLagHideAndSeek/?sid=${sid}`);
  await maybeClick(page.getByRole("button", { name: "Replace" }));
  await maybeClick(page.getByRole("button", { name: "Skip Tutorial" }));

  await expect(page.getByText("東新宿").first()).toBeVisible();
  await expect(page.getByText("Stations matched: 16")).toBeVisible();

  for (const station of fixture.expectedStationsInCodeOrder) {
    await expect(page.getByText(station.name_ja, { exact: true })).toBeVisible();
  }

  const previewText = await stationPreview(page).innerText();
  expect(countOccurrences(previewText, "東新宿")).toBe(1);
  expect(overpassMock.calls).toContainRelation("5375678");
  expect(overpassMock.calls).not.toContainWay("682766005");
});
```

Helper notes:

- `mockOverpass` should match by Overpass query structure, not by the fully URL-encoded string.
- `buildCasBlob` should reuse the project canonicalization/SID/compression behavior where possible, or mirror `server/tests/blobs.test.ts` with Node `zlib.deflateSync`.
- `seedOrMockCasBlob` can choose between real CAS `PUT` and request routing. Real `PUT` exercises more of the stack; request routing is faster and isolates the UI.
- `stationPreview(page)` should scope to the matching card so repeated station names elsewhere on the page do not create false positives.
- `maybeClick` should tolerate absent dialogs because fresh and warm browser contexts differ.
- `countOccurrences` should run against the scoped preview text, not the whole document.
