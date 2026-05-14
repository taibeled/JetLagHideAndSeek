import { expect, type Page, test } from "@playwright/test";

async function expectDialogInsideViewport(page: Page) {
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();

    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();

    if (!box || !viewport) return;

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test("tutorial dialog stays inside the mobile viewport", async ({ page }) => {
    await page.goto("/JetLagHideAndSeek");
    await page.getByRole("button", { name: "Tutorial" }).click();
    await expectDialogInsideViewport(page);

    const nextButton = page.getByRole("button", { name: "Next" });

    // Cover both centered and anchored tutorial layouts while keeping e2e runtime short.
    for (let step = 0; step < 4; step += 1) {
        await nextButton.click();
        await expectDialogInsideViewport(page);
    }
});
