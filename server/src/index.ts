import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { buildApp } from "./app.js";

function envInt(name: string, fallback: number): number {
    const v = process.env[name];
    if (!v) return fallback;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

function parseCorsOrigin(): boolean | string | (boolean | string)[] {
    const raw = process.env.CAS_CORS_ORIGINS;
    if (!raw || raw === "*") return true;
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 1) return parts[0]!;
    return parts;
}

async function main() {
    const dataDir = resolve(
        process.env.CAS_DATA_DIR ?? "./data",
    );
    await mkdir(dataDir, { recursive: true });

    const staticDir = process.env.CAS_STATIC_DIR?.trim();
    const staticPrefix =
        process.env.CAS_STATIC_PREFIX?.trim() || "/JetLagHideAndSeek/";

    const maxCanonicalBytes = envInt("CAS_MAX_BLOB_BYTES", 5 * 1024 * 1024);
    const maxCompressedBodyBytes = Math.min(
        maxCanonicalBytes * 4,
        12 * 1024 * 1024,
    );
    const maxTeamEntries = envInt("CAS_MAX_TEAM_ENTRIES", 10_000);
    const port = envInt("CAS_PORT", 8787);

    const app = await buildApp({
        dataDir,
        maxCanonicalBytes,
        maxCompressedBodyBytes,
        maxTeamEntries,
        corsOrigin: parseCorsOrigin(),
        staticSite:
            staticDir && staticDir.length > 0
                ? { root: resolve(staticDir), urlPrefix: staticPrefix }
                : null,
    });

    await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
