/* global URL, console, fetch, process, setTimeout */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";

const metroPort = 8081;
const metroStatusUrl = `http://127.0.0.1:${metroPort}/status`;
const projectRoot = new URL("..", import.meta.url).pathname;
const artifactsDir = join(projectRoot, "e2e", "artifacts");
const maestroBin = join(process.env.HOME ?? "", ".maestro", "bin");
const pathSeparator = platform() === "win32" ? ";" : ":";
const selectedFlow = process.env.E2E_FLOW ?? "all";
const devClientHost =
    process.env.E2E_DEV_CLIENT_HOST ??
    (platform() === "linux" ? "10.0.2.2" : "127.0.0.1");
const devClientBundleUrl = encodeURIComponent(
    `http://${devClientHost}:${metroPort}`,
);

const flows = [
    { name: "smoke", artifactSubdir: "smoke", flowPath: "e2e/smoke.yaml" },
    {
        name: "play-area",
        artifactSubdir: "play-area",
        flowPath: "e2e/play-area.yaml",
    },
    {
        name: "hiding-zone",
        artifactSubdir: "hiding-zone",
        flowPath: "e2e/hiding-zone.yaml",
    },
    {
        name: "radar-question",
        artifactSubdir: "radar-question",
        flowPath: "e2e/radar-question.yaml",
    },
    {
        name: "transit-line-question",
        artifactSubdir: "transit-line-question",
        flowPath: "e2e/transit-line-question.yaml",
    },
];

const env = {
    ...process.env,
    PATH: `${maestroBin}${pathSeparator}${process.env.PATH ?? ""}`,
    MAESTRO_DEV_CLIENT_URL: `jetlag-hide-seek-v2://expo-development-client/?url=${devClientBundleUrl}&disableOnboarding=1`,
};

const metro = spawn(
    "pnpm",
    [
        "exec",
        "expo",
        "start",
        "--dev-client",
        "--host",
        "localhost",
        "--port",
        String(metroPort),
        "-c",
    ],
    {
        cwd: projectRoot,
        env,
        stdio: "inherit",
    },
);

let shuttingDown = false;

async function main() {
    try {
        await waitForMetro();
        await runMaestro();
    } finally {
        await stopMetro();
    }
}

async function waitForMetro() {
    const startedAt = Date.now();
    const timeoutMs = 90_000;

    while (Date.now() - startedAt < timeoutMs) {
        if (metro.exitCode !== null) {
            throw new Error(`Metro exited early with code ${metro.exitCode}.`);
        }

        try {
            const response = await fetch(metroStatusUrl);
            const text = await response.text();
            if (text.includes("packager-status:running")) return;
        } catch {
            // Metro is still starting.
        }

        await delay(1000);
    }

    throw new Error(`Metro did not become ready at ${metroStatusUrl}.`);
}

async function runMaestro() {
    const flowsToRun =
        selectedFlow === "all"
            ? flows
            : flows.filter((flow) => flow.name === selectedFlow);

    if (flowsToRun.length === 0) {
        throw new Error(
            `Unknown E2E_FLOW "${selectedFlow}". Expected all or one of: ${flows
                .map((flow) => flow.name)
                .join(", ")}.`,
        );
    }

    for (const flow of flowsToRun) {
        mkdirSync(join(artifactsDir, flow.artifactSubdir), {
            recursive: true,
        });

        await runCommand("maestro", [
            "test",
            "--debug-output",
            join(artifactsDir, flow.artifactSubdir),
            flow.flowPath,
        ]);
    }
}

async function runCommand(command, args) {
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: projectRoot,
            env,
            stdio: "inherit",
        });

        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${command} exited with code ${code}.`));
            }
        });
    });
}

async function stopMetro() {
    if (shuttingDown || metro.exitCode !== null) return;
    shuttingDown = true;

    metro.kill("SIGINT");

    await Promise.race([
        new Promise((resolve) => metro.once("exit", resolve)),
        delay(5000).then(() => {
            if (metro.exitCode === null) metro.kill("SIGTERM");
        }),
    ]);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGINT", async () => {
    await stopMetro();
    process.exit(130);
});

process.on("SIGTERM", async () => {
    await stopMetro();
    process.exit(143);
});

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
