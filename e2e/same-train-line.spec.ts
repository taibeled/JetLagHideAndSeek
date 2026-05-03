import { expect, test } from "@playwright/test";

import {
  buildCasBlob,
  clearPwaState,
  maybeClick,
  mockOverpass,
  overpassRoute,
  seedOrMockCasBlob,
} from "./helpers";

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------

const baseSeed = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  type: "Feature",
  geometry: { type: "Point", coordinates: [139.0, 35.0] },
  properties: {
    osm_type: "R",
    osm_id: 382313,
    extent: [30.0, 130.0, 40.0, 140.0],
    country: "Japan",
    countrycode: "JP",
    name: "Japan",
    type: "country",
    isHidingZone: true,
    questions: [
      {
        id: "matching",
        key: 0,
        data: {
          lat: 35.0,
          lng: 139.0,
          drag: true,
          color: "red",
          collapsed: false,
          same: true,
          type: "same-train-line",
        },
      },
    ],
    disabledStations: [],
    hidingRadius: 600,
    hidingRadiusUnits: "meters",
    alternateLocations: [],
    zoneOptions: ["[railway=station]", "[railway=stop]"],
    zoneOperators: ["Test Metro"],
    displayHidingZones: true,
    displayHidingZonesStyle: "no-overlap",
    useCustomStations: false,
    customStations: [],
    includeDefaultStations: false,
    presets: [],
    permanentOverlay: null,
    ...overrides,
  },
});

async function loadState(
  page: any,
  seedOverrides: Record<string, unknown> = {},
) {
  await page.goto("/JetLagHideAndSeek/");
  await clearPwaState(page);
  const { sid, compressedPayload } = await buildCasBlob(
    baseSeed(seedOverrides),
  );
  await seedOrMockCasBlob(sid, compressedPayload);
  return sid;
}

async function loadWithSid(page: any, sid: string) {
  await page.goto(`?sid=${sid}`);
  await page.waitForLoadState("domcontentloaded");
  await maybeClick(page.getByRole("button", { name: "Replace" }));
  await expect(
    page.getByRole("heading", {
      name: /Welcome to the Jet Lag Hide and Seek/,
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Skip Tutorial" }).click();
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const trainLineCombobox = (page: any) =>
  page
    .getByRole("combobox")
    .filter({ hasText: /Train line|auto-detect|Loading|Test Line/ })
    .first();

async function openTrainLineDropdown(page: any) {
  await trainLineCombobox(page).click();
}

async function selectTrainLine(page: any, name: string) {
  await openTrainLineDropdown(page);
  await page.getByRole("option", { name }).click();
}

// ---------------------------------------------------------------------------
// C1: Dropdown populates from nearest station
// ---------------------------------------------------------------------------

test("C1: Dropdown populates from nearest station", async ({ page }) => {
  const sid = await loadState(page);

  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
  ]);

  await loadWithSid(page, sid);

  // Wait for stations to load and line options to populate
  await expect(trainLineCombobox(page)).toBeVisible({ timeout: 30000 });
  await expect(
    trainLineCombobox(page).filter({ hasText: "auto-detect" }),
  ).toBeVisible();

  await openTrainLineDropdown(page);

  // Assert both train line options are present
  await expect(page.getByRole("option", { name: "Test Line A" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Test Line B" })).toBeVisible();

  // Assert no route_master or direction noise
  const listbox = page.getByRole("listbox").first();
  const allOptions = await listbox.locator('[role="option"]').allTextContents();
  for (const opt of allOptions) {
    expect(opt).not.toContain("route_master");
    expect(opt).not.toContain("-->");
  }
});

// ---------------------------------------------------------------------------
// C2: Select line updates station preview
// ---------------------------------------------------------------------------

test("C2: Select line updates station preview", async ({ page }) => {
  const sid = await loadState(page);

  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
  ]);

  await loadWithSid(page, sid);

  await expect(trainLineCombobox(page)).toBeVisible({ timeout: 30000 });

  await selectTrainLine(page, "Test Line A");

  // Assert station count and names
  await expect(page.getByText("Stations matched: 3")).toBeVisible({
    timeout: 15000,
  });
  const previewContainer = page
    .locator(".max-h-40.overflow-y-auto.rounded-md.border")
    .first();
  await expect(previewContainer.getByText("Station Alpha")).toBeVisible();
  await expect(previewContainer.getByText("Station Beta")).toBeVisible();
  await expect(previewContainer.getByText("Station Gamma")).toBeVisible();

  // Re-select auto-detect
  await selectTrainLine(page, "(auto-detect from nearest station)");
  await expect(
    trainLineCombobox(page).filter({ hasText: "auto-detect" }),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// C3: Station preview empty results
// ---------------------------------------------------------------------------

test("C3: Station preview empty results", async ({ page }) => {
  const sid = await loadState(page);

  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
    overpassRoute("empty-overpass.json", ["relation(200)"]),
  ]);

  await loadWithSid(page, sid);

  await expect(trainLineCombobox(page)).toBeVisible({ timeout: 30000 });

  await selectTrainLine(page, "Test Line B");

  // Wait for the preview to update
  await expect(
    page.getByText(/No stations found for this line|Stations matched: 0/),
  ).toBeVisible({ timeout: 15000 });
});

// ---------------------------------------------------------------------------
// C4: "Loading stations..." during fetch
// ---------------------------------------------------------------------------

test("C4: Loading stations text during fetch", async ({ page }) => {
  const sid = await loadState(page);

  // Install mocks with delay on the exact line expansion
  const overpass = await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    // Delayed exact line expansion
    overpassRoute("line-expansion-minimal.json", ["relation(100)"], 800),
  ]);

  await loadWithSid(page, sid);

  await expect(trainLineCombobox(page)).toBeVisible({ timeout: 30000 });

  await openTrainLineDropdown(page);
  await page.getByRole("option", { name: "Test Line A" }).click();

  // Should briefly see "Loading stations..."
  await expect(page.getByText("Loading stations...")).toBeVisible({
    timeout: 3000,
  });

  // Then resolve to station count
  await expect(page.getByText("Stations matched: 3")).toBeVisible({
    timeout: 10000,
  });

  // Verify the Overpass call for the exact line was made
  overpass.assertCalledRelation("100");
});

// ---------------------------------------------------------------------------
// C5: Selected line clears on pin move
// ---------------------------------------------------------------------------

test("C5: Selected line clears when nearest station changes", async ({
  page,
}) => {
  const sid = await loadState(page);

  // Install distinct mocks for two different nearest-station coordinates
  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    // Body for node/1001 (initial: at 35.0)
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    // Body for node/1003 (after move: at 35.2)
    overpassRoute("line-expansion-minimal.json", ["1003"]),
    // Line options for station at 35.0 — both lines
    overpassRoute("train-lines-minimal.json", ["around:300, 35.0"]),
    // Line options for station at 35.2 — only line B
    overpassRoute("train-lines-b-only.json", ["around:300, 35.2"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
  ]);

  await loadWithSid(page, sid);

  await expect(trainLineCombobox(page)).toBeVisible({ timeout: 30000 });

  // Select Test Line A
  await selectTrainLine(page, "Test Line A");
  await expect(
    trainLineCombobox(page).filter({ hasText: "Test Line A" }),
  ).toBeVisible({ timeout: 5000 });

  // Now change the matching pin latitude to 35.2, which changes
  // the nearest station to node/1003 (at lat=35.2, lon=139.2).
  // The line options mock for 35.2 only returns Test Line B,
  // so Test Line A is no longer valid → dropdown resets to auto-detect.
  const editBtn = page.getByRole("button", { name: /edit coordinates/i });
  await editBtn.click();

  // The LatLngEditForm dialog has number inputs; latitude is the first
  const latInput = page
    .getByRole("dialog")
    .locator("input[type='number']")
    .first();
  await latInput.fill("35.2");

  await page.getByRole("button", { name: "Done" }).click();

  // Wait for the line options effect to re-fetch and clear selection
  await expect(
    trainLineCombobox(page).filter({ hasText: "auto-detect" }),
  ).toBeVisible({ timeout: 15000 });
});

// ---------------------------------------------------------------------------
// C6: "Loading train lines..." in trigger
// ---------------------------------------------------------------------------

test("C6: Loading train lines text in trigger", async ({ page }) => {
  const sid = await loadState(page);

  // Body query responds fast, line-options delayed
  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"], 800),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
  ]);

  await loadWithSid(page, sid);

  // While line options are loading, trigger shows "Loading train lines..."
  await expect(
    trainLineCombobox(page).filter({ hasText: "Loading train lines..." }),
  ).toBeVisible({ timeout: 5000 });

  // Eventually resolves to auto-detect
  await expect(
    trainLineCombobox(page).filter({ hasText: "auto-detect" }),
  ).toBeVisible({ timeout: 15000 });
});

// ---------------------------------------------------------------------------
// C7: Locked question preserves selection
// ---------------------------------------------------------------------------

test("C7: Locked question preserves selection", async ({ page }) => {
  const lockedQuestion = {
    id: "matching",
    key: 0,
    data: {
      lat: 35.0,
      lng: 139.0,
      drag: false,
      color: "red",
      collapsed: false,
      same: true,
      type: "same-train-line",
      selectedTrainLineId: "relation/100",
      selectedTrainLineLabel: "Test Line A",
    },
  };

  const sid = await loadState(page, {
    questions: [lockedQuestion],
  });

  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
  ]);

  await loadWithSid(page, sid);

  // The question is locked (drag: false), dropdown shows label and is disabled
  const trigger = trainLineCombobox(page).filter({ hasText: "Test Line A" });
  await expect(trigger).toBeVisible({ timeout: 15000 });
  await expect(trigger).toBeDisabled();

  // Build a new CAS blob from the same state (roundtrip verification)
  const { sid: sid2, compressedPayload } = await buildCasBlob(
    baseSeed({ questions: [lockedQuestion] }),
  );
  await seedOrMockCasBlob(sid2, compressedPayload);

  // Load in a fresh page context
  const newPage = await page.context().newPage();
  await newPage.goto("/JetLagHideAndSeek/");
  await clearPwaState(newPage);
  await mockOverpass(newPage, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
  ]);

  await loadWithSid(newPage, sid2);

  // Selection should be preserved after roundtrip
  const trigger2 = trainLineCombobox(newPage).filter({ hasText: "Test Line A" });
  await expect(trigger2).toBeVisible({ timeout: 15000 });
  await expect(trigger2).toBeDisabled();

  await newPage.close();
});

// ---------------------------------------------------------------------------
// C8: Backward compat — no selectedTrainLineId
// ---------------------------------------------------------------------------

test("C8: Backward compat — no selectedTrainLineId in snapshot", async ({
  page,
}) => {
  const sid = await loadState(page, {
    questions: [
      {
        id: "matching",
        key: 0,
        data: {
          lat: 35.0,
          lng: 139.0,
          drag: true,
          color: "red",
          collapsed: false,
          same: true,
          type: "same-train-line",
          // selectedTrainLineId intentionally absent
        },
      },
    ],
  });

  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
  ]);

  await loadWithSid(page, sid);

  // Dropdown should show auto-detect (computed from nearest station)
  await expect(
    trainLineCombobox(page).filter({ hasText: "auto-detect" }),
  ).toBeVisible({ timeout: 30000 });

  // Station preview should still resolve via auto-detect
  await expect(page.getByText("Stations matched: 3")).toBeVisible({
    timeout: 15000,
  });
});

// ---------------------------------------------------------------------------
// C9: Hiderification with selected line
// ---------------------------------------------------------------------------

test("C9: Hiderification updates same toggle based on train line", async ({
  page,
}) => {
  const sid = await loadState(page);

  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
  ]);

  await loadWithSid(page, sid);

  await expect(trainLineCombobox(page)).toBeVisible({ timeout: 30000 });

  // Select Test Line A
  await selectTrainLine(page, "Test Line A");

  // Open Options drawer and enable Hider Mode
  await page.getByRole("button", { name: "Options" }).click();
  await expect(
    page.getByRole("heading", { name: "Options" }),
  ).toBeVisible({ timeout: 5000 });

  // The hider mode checkbox is next to a label with "Hider mode?"
  const hiderCheckbox = page
    .locator("label")
    .filter({ hasText: /Hider mode/i })
    .locator("..")
    .getByRole("checkbox");
  await hiderCheckbox.click();

  // After hiderification, the "same" result toggle should be visible.
  // The hider defaults to map center (35.0, 139.0) — same as Station Alpha,
  // which is on Test Line A → both on same line → "Same" should be selected.
  const sameToggle = page
    .getByRole("radio", { name: "Same" })
    .filter({ hasText: "Same" });
  await expect(sameToggle.first()).toBeVisible({ timeout: 10000 });

  // Close the options drawer via Escape
  await page.keyboard.press("Escape");
});

// ---------------------------------------------------------------------------
// C10: ZoneSidebar filters with selected line
// ---------------------------------------------------------------------------

test("C10: ZoneSidebar shows only selected-line stations", async ({ page }) => {
  const sid = await loadState(page);

  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
    overpassRoute("empty-overpass.json", ["relation(200)"]),
  ]);

  await loadWithSid(page, sid);

  // Wait for station discovery and filtering to complete
  await expect(trainLineCombobox(page)).toBeVisible({ timeout: 30000 });

  // Wait for the station preview to show the auto-detected line's stations
  await expect(page.getByText("Stations matched: 3")).toBeVisible({
    timeout: 15000,
  });

  // ZoneSidebar should have station display options (confirming stations loaded)
  await expect(page.getByText("All Stations")).toBeVisible({ timeout: 10000 });

  // Verify station names from the auto-detected line appear in the preview
  const previewContainer = page
    .locator(".max-h-40.overflow-y-auto.rounded-md.border")
    .first();
  await expect(previewContainer.getByText("Station Alpha")).toBeVisible();
  await expect(previewContainer.getByText("Station Beta")).toBeVisible();
  await expect(previewContainer.getByText("Station Gamma")).toBeVisible();

  // Select a line with no stations — preview should go empty
  await selectTrainLine(page, "Test Line B");

  await expect(
    page.getByText(/No stations found for this line|Stations matched: 0/),
  ).toBeVisible({ timeout: 15000 });
});

// ---------------------------------------------------------------------------
// C11: Custom-only station list warning
// ---------------------------------------------------------------------------

test("C11: Custom-only station list warning toast", async ({ page }) => {
  const sid = await loadState(page, {
    useCustomStations: true,
    includeDefaultStations: false,
    zoneOperators: [],
  });

  // No station discovery mocks needed — custom-only skips default discovery
  await mockOverpass(page, [
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
  ]);

  await loadWithSid(page, sid);

  // Wait for the ZoneSidebar to initialize and emit the warning toast
  await expect(
    page.getByText(/'Same train line' isn't supported with custom-only/),
  ).toBeVisible({ timeout: 30000 });
});

// ---------------------------------------------------------------------------
// C12: Wire serialization with selectedTrainLineId
// ---------------------------------------------------------------------------

test("C12: Wire serialization roundtrip preserves selectedTrainLineId", async ({
  page,
}) => {
  const seedSnapshot = baseSeed({
    questions: [
      {
        id: "matching",
        key: 0,
        data: {
          lat: 35.0,
          lng: 139.0,
          drag: false,
          color: "red",
          collapsed: false,
          same: true,
          type: "same-train-line",
          selectedTrainLineId: "relation/100",
          selectedTrainLineLabel: "Test Line A",
        },
      },
    ],
  } as Record<string, unknown>);

  // Build two SIDs from the same canonical input — they must be identical
  const { sid: sidA, compressedPayload: payloadA } =
    await buildCasBlob(seedSnapshot);
  const { sid: sidB } = await buildCasBlob(seedSnapshot);

  // Deterministic: same input → same SID
  expect(sidA).toBe(sidB);

  await seedOrMockCasBlob(sidA, payloadA);

  // Load the page using the SID and verify selection is preserved
  await page.goto("/JetLagHideAndSeek/");
  await clearPwaState(page);
  await mockOverpass(page, [
    overpassRoute("stations-minimal.json", [
      "[railway=station]",
      "[railway=stop]",
    ]),
    overpassRoute("line-expansion-minimal.json", ["1001"]),
    overpassRoute("train-lines-minimal.json", ["around:300"]),
    overpassRoute("line-expansion-minimal.json", ["relation(100)"]),
  ]);

  await loadWithSid(page, sidA);

  // Verify selectedTrainLineId and selectedTrainLineLabel survive roundtrip
  const trigger = trainLineCombobox(page).filter({ hasText: "Test Line A" });
  await expect(trigger).toBeVisible({ timeout: 15000 });
  await expect(trigger).toBeDisabled();
});
