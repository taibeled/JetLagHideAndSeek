/* global URL, console, fetch, process, setTimeout */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";

import {
    createMetroWarmUrl,
    resolveE2ePlatform,
    selectFlows,
} from "./e2e-maestro-stack-config.mjs";

const metroPort = 8081;
const metroStatusUrl = `http://127.0.0.1:${metroPort}/status`;
const projectRoot = new URL("..", import.meta.url).pathname;
const appConfig = JSON.parse(
    readFileSync(join(projectRoot, "app.json"), "utf8"),
).expo;
const artifactsDir = join(projectRoot, "e2e", "artifacts");
const maestroBin = join(process.env.HOME ?? "", ".maestro", "bin");
const pathSeparator = platform() === "win32" ? ";" : ":";
const selectedFlow = process.env.E2E_FLOW ?? "all";
const e2ePlatform = resolveE2ePlatform(process.env.E2E_PLATFORM, platform());
const maestroDevice = process.env.E2E_MAESTRO_DEVICE;
const devClientHost =
    process.env.E2E_DEV_CLIENT_HOST ??
    (platform() === "linux" ? "10.0.2.2" : "127.0.0.1");
const devClientBundleUrl = encodeURIComponent(
    `http://${devClientHost}:${metroPort}`,
);

const flows = [
    {
        name: "warmup",
        artifactSubdir: "warmup",
        flowPath: "e2e/warmup.yaml",
    },
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
    E2E_PLATFORM: e2ePlatform,
    PATH: `${maestroBin}${pathSeparator}${process.env.PATH ?? ""}`,
    MAESTRO_DEV_CLIENT_URL: `exp+${appConfig.slug}://expo-development-client/?url=${devClientBundleUrl}&disableOnboarding=1`,
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
        await warmMetroBundle();
        await runMaestro();
    } finally {
        await stopMetro();
    }
}

async function warmMetroBundle() {
    const warmedAt = Date.now();
    const warmUrl = createMetroWarmUrl(metroPort, e2ePlatform);
    console.log(`Pre-warming Metro bundle at ${warmUrl} ...`);
    try {
        const response = await fetch(warmUrl);
        await response.arrayBuffer();
        console.log(
            `Bundle pre-warmed in ${((Date.now() - warmedAt) / 1000).toFixed(1)}s.`,
        );
    } catch (err) {
        console.warn(`Bundle pre-warm failed (${err.message}), continuing...`);
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
    const flowsToRun = selectFlows(flows, selectedFlow);

    const failures = [];

    for (const flow of flowsToRun) {
        mkdirSync(join(artifactsDir, flow.artifactSubdir), {
            recursive: true,
        });

        let lastError = null;
        const attempts = 2;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            const attemptArtifactsDir = join(
                artifactsDir,
                flow.artifactSubdir,
                `attempt-${attempt}`,
            );
            mkdirSync(attemptArtifactsDir, { recursive: true });

            if (attempt > 1) {
                console.log(
                    `\nRetrying ${flow.name} (attempt ${attempt}/${attempts})...`,
                );
            }
            try {
                if (e2ePlatform === "android") {
                    await waitForAndroidDevice();
                }
                await runCommand("maestro", [
                    ...(maestroDevice ? ["--device", maestroDevice] : []),
                    "test",
                    "--debug-output",
                    attemptArtifactsDir,
                    flow.flowPath,
                ]);
                lastError = null;
                break;
            } catch (error) {
                lastError = error;
                console.error(`\n${flow.name} failed on attempt ${attempt}.`);
                if (e2ePlatform === "android") {
                    await captureAndroidDiagnostics(attemptArtifactsDir);
                }
            }
        }

        if (lastError) {
            failures.push({ name: flow.name, error: lastError });
        }
    }

    if (failures.length > 0) {
        const names = failures.map((f) => f.name).join(", ");
        console.error(
            `\n${failures.length} flow(s) failed after retries: ${names}`,
        );
        for (const { name, error } of failures) {
            console.error(`\n--- ${name} ---`);
            console.error(error.message);
        }
        throw new Error(`Maestro E2E failures: ${names}`);
    }
}

async function waitForAndroidDevice() {
    const startedAt = Date.now();
    const timeoutMs = 30_000;

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const state = (
                await runCommandCapture("adb", adbArgs(["get-state"]))
            ).trim();
            const bootCompleted = (
                await runCommandCapture(
                    "adb",
                    adbArgs(["shell", "getprop", "sys.boot_completed"]),
                )
            ).trim();

            if (state === "device" && bootCompleted === "1") return;
        } catch {
            // The emulator may be reconnecting between Maestro attempts.
        }

        await delay(1000);
    }

    throw new Error("Android emulator did not become ready within 30 seconds.");
}

async function captureAndroidDiagnostics(attemptArtifactsDir) {
    const diagnostics = [];
    for (const [label, args] of [
        ["adb devices -l", ["devices", "-l"]],
        ["adb get-state", adbArgs(["get-state"])],
        [
            "adb shell getprop sys.boot_completed",
            adbArgs(["shell", "getprop", "sys.boot_completed"]),
        ],
        ["adb logcat -d -t 500", adbArgs(["logcat", "-d", "-t", "500"])],
    ]) {
        diagnostics.push(`$ ${label}`);
        try {
            diagnostics.push(await runCommandCapture("adb", args));
        } catch (error) {
            diagnostics.push(error.message);
        }
        diagnostics.push("");
    }

    writeFileSync(
        join(attemptArtifactsDir, "android-diagnostics.txt"),
        diagnostics.join("\n"),
    );
}

function adbArgs(args) {
    return maestroDevice ? ["-s", maestroDevice, ...args] : args;
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

async function runCommandCapture(command, args) {
    return await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: projectRoot,
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(
                    new Error(
                        `${command} exited with code ${code}.\n${stderr || stdout}`,
                    ),
                );
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
