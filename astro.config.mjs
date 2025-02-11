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
        AstroPWA({
            manifest: {
                name: "Jet Lag Hide and Seek Map Generator",
                short_name: "Map Generator",
                description:
                    "Automatically generate maps for Jet Lag The Game: Hide and Seek with ease! Simply name the questions and watch the map eliminate hundreds of possibilities in seconds.",
                display: "standalone",
                start_url: "/JetLagHideAndSeek",
                icons: [
                    {
                        src: "/JetLagHideAndSeek/JLIcon.png",
                        sizes: "1080x1080",
                        type: "image/png",
                    },
                ],
            },
        }),
    ],
    devToolbar: {
        enabled: false,
    },
    site: "https://taibeled.github.io",
    base: "JetLagHideAndSeek",
});
