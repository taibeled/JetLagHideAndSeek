import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4321/JetLagHideAndSeek";

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL,
        trace: "on-first-retry",
    },
    // Test the production build, not `astro dev`. Dev mode injects Tailwind
    // CSS via JS (FOUC) and compiles .tsx on demand, so measuring layout right
    // after load is racy — the dialog was read at its unstyled full-content
    // width or hadn't hydrated yet. `astro preview` serves the built artifact
    // (real stylesheet, no on-demand compile), which is also what deploys.
    webServer: {
        command: "pnpm build && pnpm preview --host 127.0.0.1",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "mobile-chromium",
            use: { ...devices["Pixel 5"] },
        },
    ],
});
