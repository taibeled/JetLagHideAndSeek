#!/usr/bin/env node
/**
 * Starts the CAS server with the built Astro app served from the same origin.
 * Expects `pnpm build` and `pnpm --dir server build` (use `pnpm start:app` for build + start).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = resolve(root, "server", "dist", "index.js");
/** Astro `base` only affects URL prefixes; static export files live at repo `dist/`. */
const staticRoot = resolve(root, "dist");
const indexHtml = resolve(staticRoot, "index.html");

if (!existsSync(serverEntry)) {
    console.error(
        "Missing server build at server/dist/. Run: pnpm build:all   or   pnpm --dir server build",
    );
    process.exit(1);
}

if (!existsSync(indexHtml)) {
    console.error(
        "Missing frontend build at dist/index.html. Run: pnpm build",
    );
    process.exit(1);
}

const env = {
    ...process.env,
    CAS_STATIC_DIR: staticRoot,
    CAS_STATIC_PREFIX: "/JetLagHideAndSeek/",
};

const child = spawn(process.execPath, [serverEntry], {
    env,
    cwd: resolve(root, "server"),
    stdio: "inherit",
});

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 1);
});
