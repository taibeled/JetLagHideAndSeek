import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

export const PERF_ROOT = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(PERF_ROOT, "..");
export const RUNNER_VERSION = 2;

export type JsonObject = Record<string, unknown>;

export type ScenarioValue = {
    metrics?: Record<string, number | string>;
    output: unknown;
};

export type PerfScenario = {
    fixtureHash?: string;
    group: string;
    iterations: number;
    name: string;
    run: () => Promise<ScenarioValue> | ScenarioValue;
    setup?: () => Promise<void> | void;
    warmups: number;
};

export type ScenarioResult = {
    digest: string;
    fixtureHash?: string;
    group: string;
    iterations: number;
    maxMs: number;
    medianMs: number;
    metrics: Record<string, number | string>;
    minMs: number;
    name: string;
    p95Ms: number;
    samplesMs: number[];
    warmups: number;
};

export type PerfRun = {
    metadata: {
        arch: string;
        cpu: string;
        dirty: boolean;
        fixtureManifestHash: string;
        gitCommit: string;
        node: string;
        os: string;
        runnerVersion: number;
        timestamp: string;
    };
    results: ScenarioResult[];
};

export type CaptureEnvelope<T = unknown> = {
    attribution: string;
    capturedAt: string;
    endpoint: string;
    id: string;
    payload: T;
    query?: string;
    requestUrl: string;
    responseBytes: number;
    responseSha256: string;
    schemaVersion: number;
    source: string;
};

export function repoPath(...parts: string[]): string {
    return resolve(REPO_ROOT, ...parts);
}

export function perfPath(...parts: string[]): string {
    return resolve(PERF_ROOT, ...parts);
}

export function readJson<T>(filename: string): T {
    return JSON.parse(readFileSync(filename, "utf8")) as T;
}

export function writeJson(filename: string, value: unknown): void {
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, `${JSON.stringify(value, null, 4)}\n`);
}

export function sha256(value: string | Buffer): string {
    return createHash("sha256").update(value).digest("hex");
}

export function canonicalDigest(value: unknown): string {
    return sha256(JSON.stringify(canonicalize(value)));
}

export function fixtureHash(filename: string): string {
    return sha256(readFileSync(filename));
}

export function loadCapture<T>(filename: string): CaptureEnvelope<T> {
    return readJson<CaptureEnvelope<T>>(filename);
}

export function outputMetrics(output: unknown): Record<string, number> {
    return {
        outputBytes: Buffer.byteLength(JSON.stringify(output)),
        outputFeatures: countFeatures(output),
        outputVertices: countVertices(output),
    };
}

export async function runScenario(
    scenario: PerfScenario,
): Promise<ScenarioResult> {
    for (let index = 0; index < scenario.warmups; index += 1) {
        await scenario.setup?.();
        await scenario.run();
    }

    const samplesMs: number[] = [];
    let expectedDigest: string | undefined;
    let lastValue: ScenarioValue | undefined;

    for (let index = 0; index < scenario.iterations; index += 1) {
        await scenario.setup?.();
        const start = performance.now();
        lastValue = await scenario.run();
        samplesMs.push(performance.now() - start);
        const digest = canonicalDigest(lastValue.output);
        if (expectedDigest !== undefined && digest !== expectedDigest) {
            throw new Error(
                `Scenario ${scenario.name} produced non-deterministic output.`,
            );
        }
        expectedDigest = digest;
    }

    if (!lastValue) {
        throw new Error(`Scenario ${scenario.name} did not produce an output.`);
    }

    const sorted = [...samplesMs].sort((a, b) => a - b);
    return {
        digest: expectedDigest ?? canonicalDigest(lastValue.output),
        fixtureHash: scenario.fixtureHash,
        group: scenario.group,
        iterations: scenario.iterations,
        maxMs: sorted.at(-1) ?? 0,
        medianMs: percentile(sorted, 0.5),
        metrics: {
            ...outputMetrics(lastValue.output),
            ...lastValue.metrics,
        },
        minMs: sorted[0] ?? 0,
        name: scenario.name,
        p95Ms: percentile(sorted, 0.95),
        samplesMs,
        warmups: scenario.warmups,
    };
}

export function buildRunMetadata(): PerfRun["metadata"] {
    const manifest = perfPath("capture-manifest.json");
    return {
        arch: process.arch,
        cpu: cpus()[0]?.model ?? "unknown",
        dirty: git(["status", "--porcelain"]).trim().length > 0,
        fixtureManifestHash: fixtureHash(manifest),
        gitCommit: git(["rev-parse", "HEAD"]).trim(),
        node: process.version,
        os: `${platform()} ${release()}`,
        runnerVersion: RUNNER_VERSION,
        timestamp: new Date().toISOString(),
    };
}

export function installOfflineNetworkGuard(): void {
    globalThis.fetch = async () => {
        throw new Error(
            "perf:test attempted an outbound request. Use a tracked fixture.",
        );
    };
}

export function parseOption(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
}

export function printResultTable(results: ScenarioResult[]): void {
    const rows = results.map((result) => ({
        digest: result.digest.slice(0, 10),
        group: result.group,
        median: result.medianMs.toFixed(2),
        name: result.name,
        p95: result.p95Ms.toFixed(2),
        vertices: String(result.metrics.outputVertices ?? 0),
    }));
    console.table(rows);
}

function git(args: string[]): string {
    try {
        return execFileSync("git", args, {
            cwd: REPO_ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
    } catch {
        return "unknown";
    }
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as JsonObject)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, part]) => [key, canonicalize(part)]),
        );
    }
    return value;
}

function percentile(sorted: number[], ratio: number): number {
    if (sorted.length === 0) return 0;
    return sorted[
        Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
    ];
}

function countFeatures(value: unknown): number {
    if (!value || typeof value !== "object") return 0;
    if (
        "type" in value &&
        value.type === "FeatureCollection" &&
        "features" in value &&
        Array.isArray(value.features)
    ) {
        return value.features.length;
    }
    return 0;
}

function countVertices(value: unknown): number {
    if (!Array.isArray(value)) {
        if (!value || typeof value !== "object") return 0;
        return Object.values(value as JsonObject).reduce<number>(
            (sum, part) => sum + countVertices(part),
            0,
        );
    }

    if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
    ) {
        return 1;
    }

    return value.reduce((sum, part) => sum + countVertices(part), 0);
}
