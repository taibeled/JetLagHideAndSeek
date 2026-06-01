import { existsSync } from "node:fs";

import {
    buildRunMetadata,
    installOfflineNetworkGuard,
    loadCapture,
    parseOption,
    perfPath,
    printResultTable,
    readJson,
    repoPath,
    runScenario,
    writeJson,
    type PerfRun,
} from "./lib.mts";
import { boundaryScenarios } from "./scenarios/boundary.mts";
import { hidingZoneScenarios } from "./scenarios/hiding-zone.mts";
import { maskBuilderScenarios } from "./scenarios/mask-builder.mts";
import { matchingScenarios } from "./scenarios/matching.mts";
import { persistenceScenarios } from "./scenarios/persistence.mts";
import { photonScenarios } from "./scenarios/photon.mts";
import { radarScenarios } from "./scenarios/radar.mts";

const captureManifest = readJson<{
    requests: { id: string; output: string; source: string }[];
    schemaVersion: number;
}>(perfPath("capture-manifest.json"));

for (const request of captureManifest.requests) {
    const filename = perfPath(request.output);
    if (!existsSync(filename)) {
        throw new Error(
            `Missing captured fixture ${request.output}. Run pnpm perf:capture first.`,
        );
    }
    const fixture = loadCapture(filename);
    if (
        fixture.id !== request.id ||
        fixture.schemaVersion !== captureManifest.schemaVersion ||
        fixture.source !== request.source ||
        !fixture.responseSha256 ||
        fixture.responseBytes <= 0
    ) {
        throw new Error(`Invalid captured fixture envelope: ${request.output}`);
    }
}

installOfflineNetworkGuard();

const scenarios = [
    ...boundaryScenarios,
    ...hidingZoneScenarios,
    ...matchingScenarios,
    ...maskBuilderScenarios,
    ...radarScenarios,
    ...persistenceScenarios,
    ...photonScenarios,
];
const selectedGroup = parseOption("--scenario");
const selected = selectedGroup
    ? scenarios.filter((scenario) => scenario.group === selectedGroup)
    : scenarios;

if (selected.length === 0) {
    throw new Error(`No scenarios found for group: ${selectedGroup}`);
}

const results = [];
for (const [index, scenario] of selected.entries()) {
    process.stdout.write(
        `[${index + 1}/${selected.length}] ${scenario.name}\n`,
    );
    installOfflineNetworkGuard();
    results.push(await runScenario(scenario));
}

const run: PerfRun = {
    metadata: buildRunMetadata(),
    results,
};
const output = parseOption("--json");
if (output) {
    writeJson(repoPath(output), run);
    console.log(`Wrote ${output}`);
}
printResultTable(results);
