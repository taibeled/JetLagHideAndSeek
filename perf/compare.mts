import { existsSync, writeFileSync } from "node:fs";

import {
    parseOption,
    readJson,
    repoPath,
    type PerfRun,
    type ScenarioResult,
} from "./lib.mts";

const baselineFilename = repoPath(
    parseOption("--baseline") ?? "perf/baselines/reference.json",
);
const currentFilename = repoPath(
    parseOption("--current") ?? "perf/results/latest.json",
);
const outputFilename = parseOption("--markdown");

if (!existsSync(baselineFilename)) {
    throw new Error(`Missing baseline: ${baselineFilename}`);
}
if (!existsSync(currentFilename)) {
    throw new Error(`Missing current result: ${currentFilename}`);
}

const baseline = readJson<PerfRun>(baselineFilename);
const current = readJson<PerfRun>(currentFilename);
if (
    baseline.metadata.fixtureManifestHash !==
    current.metadata.fixtureManifestHash
) {
    throw new Error("Cannot compare runs with different fixture manifests.");
}
const markdown = renderComparison(baseline, current);

if (outputFilename) {
    writeFileSync(repoPath(outputFilename), `${markdown}\n`);
} else {
    console.log(markdown);
}

function renderComparison(baseline: PerfRun, current: PerfRun): string {
    const baselineByName = new Map(
        baseline.results.map((result) => [result.name, result]),
    );
    const lines = [
        "# Performance Replay Comparison",
        "",
        `Baseline: \`${baseline.metadata.gitCommit.slice(0, 12)}\``,
        `Current: \`${current.metadata.gitCommit.slice(0, 12)}\``,
        "",
        "| Scenario | Baseline median | Current median | Delta | p95 delta | Digest |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ];

    for (const result of current.results) {
        const previous = baselineByName.get(result.name);
        if (!previous) {
            lines.push(
                `| ${result.name} | new | ${formatMs(result.medianMs)} | new | new | ${result.digest.slice(0, 10)} |`,
            );
            continue;
        }
        lines.push(renderRow(previous, result));
    }

    return lines.join("\n");
}

function renderRow(previous: ScenarioResult, current: ScenarioResult): string {
    const delta = current.medianMs - previous.medianMs;
    const p95Delta = current.p95Ms - previous.p95Ms;
    const digest = current.digest === previous.digest ? "same" : "**changed**";
    return `| ${current.name} | ${formatMs(previous.medianMs)} | ${formatMs(current.medianMs)} | ${formatDelta(delta, previous.medianMs)} | ${formatDelta(p95Delta, previous.p95Ms)} | ${digest} |`;
}

function formatDelta(delta: number, baseline: number): string {
    const percent = baseline === 0 ? 0 : (delta / baseline) * 100;
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} ms (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`;
}

function formatMs(value: number): string {
    return `${value.toFixed(2)} ms`;
}
