// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import partytown from "@astrojs/partytown";
import AstroPWA from "@vite-pwa/astro";

// https://astro.build/config
export default defineConfig({
    integrations: [
        react(),
        tailwind({
            applyBaseStyles: false,
        }),
        partytown({
            config: {
                forward: ["dataLayer.push"],
            },
        }),
        AstroPWA(),
    ],
    devToolbar: {
        enabled: false,
    },
    site: "https://taibeled.github.io",
    base: "JetLagHideAndSeek",
});
