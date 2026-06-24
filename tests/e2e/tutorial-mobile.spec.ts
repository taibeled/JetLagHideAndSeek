import { expect, type Page, test } from "@playwright/test";

async function expectDialogInsideViewport(page: Page) {
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (!viewport) return;

    // The dialog is placed by a JS positioning effect (and a short open
    // transition), so for a frame right after it mounts it is unpositioned and
    // can overflow. Poll until it has settled fully inside the viewport. This
    // still fails — the poll times out — if it never fits, so a real overflow
    // is still caught.
    await expect
        .poll(
            async () => {
                const box = await dialog.boundingBox();
                if (!box) return false;
                return (
                    box.x >= 0 &&
                    box.y >= 0 &&
                    box.x + box.width <= viewport.width &&
                    box.y + box.height <= viewport.height
                );
            },
            {
                timeout: 5000,
                message: "tutorial dialog never settled inside the viewport",
            },
        )
        .toBe(true);
}

test("tutorial dialog stays inside the mobile viewport", async ({ page }) => {
    // The tutorial auto-opens on first visit (a fresh context is always a
    // first visit). Don't click the "Tutorial" button: it sits behind this
    // modal's backdrop (so the click is intercepted) and its name also
    // substring-matches "Skip Tutorial". Just measure the dialog that opens.
    await page.goto("./");
    await expectDialogInsideViewport(page);

    // `exact` avoids matching any other button whose name contains "Next".
    const nextButton = page.getByRole("button", { name: "Next", exact: true });

    // Cover both centered and anchored tutorial layouts while keeping e2e runtime short.
    for (let step = 0; step < 4; step += 1) {
        await nextButton.click();
        await expectDialogInsideViewport(page);
    }
});
