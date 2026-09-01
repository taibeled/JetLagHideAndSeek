import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        alias: {
            "@/": new URL("./src/", import.meta.url).pathname,
        },
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup.ts"],
    },
});
