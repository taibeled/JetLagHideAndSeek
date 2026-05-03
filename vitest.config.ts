import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/server/**",
            "**/e2e/**",
        ],
        alias: {
            "@/": new URL("./src/", import.meta.url).pathname,
        },
    },
});
