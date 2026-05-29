/* global console, process */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const preferredSimulatorName =
    process.env.E2E_IOS_SIMULATOR_NAME ?? "iPhone 16 Pro";
const projectRoot = new URL("..", import.meta.url).pathname;
const appConfig = JSON.parse(
    readFileSync(join(projectRoot, "app.json"), "utf8"),
).expo;

process.env.E2E_MAESTRO_DEVICE ??= resolveIosSimulatorDeviceId();
resetElementInspector(process.env.E2E_MAESTRO_DEVICE);

await import("./e2e-maestro-stack.mjs");

function resolveIosSimulatorDeviceId() {
    const devices = listAvailableIosSimulators();
    const booted = devices.find((device) => device.state === "Booted");
    if (booted) {
        console.log(`Using booted iOS simulator for Maestro: ${booted.name}`);
        return booted.udid;
    }

    const preferred = devices.find(
        (device) => device.name === preferredSimulatorName,
    );
    if (preferred) {
        console.log(
            `Using iOS simulator for Maestro: ${preferred.name} (${preferred.state})`,
        );
        return preferred.udid;
    }

    throw new Error(
        `No available iOS simulator found for Maestro. Boot a simulator or set E2E_IOS_SIMULATOR_NAME. Looked for "${preferredSimulatorName}".`,
    );
}

function listAvailableIosSimulators() {
    const output = execFileSync(
        "xcrun",
        ["simctl", "list", "devices", "available", "--json"],
        {
            encoding: "utf8",
        },
    );
    const parsed = JSON.parse(output);
    return Object.values(parsed.devices ?? {})
        .flat()
        .filter(isSimulatorDevice);
}

function isSimulatorDevice(value) {
    return (
        value &&
        typeof value === "object" &&
        typeof value.name === "string" &&
        typeof value.udid === "string" &&
        typeof value.state === "string"
    );
}

function resetElementInspector(deviceId) {
    if (!deviceId) return;
    try {
        execFileSync(
            "xcrun",
            [
                "simctl",
                "spawn",
                deviceId,
                "defaults",
                "write",
                appConfig.ios.bundleIdentifier,
                "showInspector",
                "-bool",
                "false",
            ],
            { stdio: "ignore" },
        );
    } catch (error) {
        console.warn(
            `Could not reset React Native element inspector for simulator ${deviceId}: ${error.message}`,
        );
    }
}
