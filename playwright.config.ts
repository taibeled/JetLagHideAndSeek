import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm start:app",
    url: "http://localhost:8787/JetLagHideAndSeek/",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: "http://localhost:8787/JetLagHideAndSeek/" },
});
