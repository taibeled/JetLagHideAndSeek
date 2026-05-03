import { test, expect } from "@playwright/test";

import fixture from "../TEST_PLAN/playwright-same-train-line-fukutoshin-fixture.json" with { type: "json" };

import {
  buildCasBlob,
  clearPwaState,
  maybeClick,
  mockOverpass,
  overpassRoute,
  seedOrMockCasBlob,
  type OverpassMock,
} from "./helpers";

const expectedStations = fixture.expectedStationsInCodeOrder as Array<{
  station_code: string;
  name_en: string;
  name_ja: string;
}>;
const stationNames = expectedStations.map((s) => s.name_ja);

test("C13: Fukutoshin Line auto-detect from Higashi-shinjuku picks relation, not way", async ({
  page,
}) => {
  // Navigate once to establish a page context for clearPwaState
  await page.goto("/JetLagHideAndSeek/");
  await clearPwaState(page);

  // Build the CAS blob from the portable seed snapshot and seed the server
  const { sid, compressedPayload } = await buildCasBlob(
    fixture.portableSeedSnapshot,
  );
  await seedOrMockCasBlob(sid, compressedPayload);

  // Install Overpass mocks — order from most specific fragment to broadest
  const overpass: OverpassMock = await mockOverpass(page, [
    overpassRoute("fukutoshin-nearest-station.json", ["1951953898"]),
    overpassRoute("fukutoshin-exact-line.json", ["5375678"]),
    overpassRoute("fukutoshin-line-options.json", ["around:300"]),
    overpassRoute("fukutoshin-station-discovery.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
  ]);

  // Navigate with the shared SID to hydrate the fixture state
  // Use a relative URL so baseURL prefix (/JetLagHideAndSeek/) is preserved
  await page.goto(`?sid=${sid}`);
  await page.waitForLoadState("domcontentloaded");

  // Dismiss Replace dialog if it appears (won't when local state is empty)
  await maybeClick(page.getByRole("button", { name: "Replace" }));

  // Dismiss tutorial dialog
  await expect(
    page.getByRole("heading", { name: /Welcome to the Jet Lag Hide and Seek/ }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Skip Tutorial" }).click();

  // Assert the Higashi-shinjuku station label (東新宿) is visible
  await expect(page.getByText("東新宿").first()).toBeVisible({
    timeout: 30000,
  });

  // Assert the station count summary
  await expect(page.getByText("Stations matched: 16")).toBeVisible({
    timeout: 15000,
  });

  // Assert every expected station name_ja appears on the page
  for (const name of stationNames) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
  }

  // Assert 東新宿 appears exactly once in the station preview (no duplicate)
  const previewContainer = page
    .locator(".max-h-40.overflow-y-auto.rounded-md.border")
    .first();
  const previewText = await previewContainer.innerText();
  const higashiShinjukuCount = (previewText.match(/東新宿/g) || []).length;
  expect(higashiShinjukuCount).toBe(1);

  // Assert Overpass called relation(5375678), not way(682766005)
  overpass.assertCalledRelation("5375678");
  overpass.assertNotCalledWay("682766005");
});
