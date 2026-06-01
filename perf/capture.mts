import { setTimeout as sleep } from "node:timers/promises";

import { parseOption, perfPath, readJson, sha256, writeJson } from "./lib.mts";

type CaptureRequest = {
    attribution: string;
    endpoint: string;
    id: string;
    output: string;
    params?: Record<string, string>;
    query?: string;
    source: "overpass" | "photon";
};

type CaptureManifest = {
    requests: CaptureRequest[];
    schemaVersion: number;
};

const manifestFilename = perfPath(
    parseOption("--manifest") ?? "capture-manifest.json",
);
const only = parseOption("--only");
const manifest = readJson<CaptureManifest>(manifestFilename);
const requests = only
    ? manifest.requests.filter((request) => request.id === only)
    : manifest.requests;

if (only && requests.length === 0) {
    throw new Error(`Unknown capture fixture: ${only}`);
}

for (const [index, request] of requests.entries()) {
    const url = buildRequestUrl(request);
    console.log(`[${index + 1}/${requests.length}] capturing ${request.id}`);
    const response = await fetchWithRetry(request, url);
    const raw = await response.text();
    const payload = JSON.parse(raw) as unknown;
    writeJson(perfPath(request.output), {
        attribution: request.attribution,
        capturedAt: new Date().toISOString(),
        endpoint: request.endpoint,
        id: request.id,
        payload,
        query: request.query,
        requestUrl: url,
        responseBytes: Buffer.byteLength(raw),
        responseSha256: sha256(raw),
        schemaVersion: manifest.schemaVersion,
        source: request.source,
    });
    console.log(`  wrote ${request.output} (${Buffer.byteLength(raw)} bytes)`);

    if (index < requests.length - 1) {
        await sleep(request.source === "overpass" ? 750 : 250);
    }
}

async function fetchWithRetry(
    request: CaptureRequest,
    url: string,
): Promise<Response> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const response = await fetch(url, {
            headers: {
                "user-agent": "JetLagHideAndSeek performance fixture capture",
            },
            signal: AbortSignal.timeout(45_000),
        });
        if (response.ok) return response;

        if (
            attempt === 3 ||
            (response.status < 500 && response.status !== 429)
        ) {
            throw new Error(
                `${request.id} failed with HTTP ${response.status}`,
            );
        }
        console.log(
            `  HTTP ${response.status}; retrying attempt ${attempt + 1}`,
        );
        await sleep(attempt * 1500);
    }

    throw new Error(`${request.id} failed without a response`);
}

function buildRequestUrl(request: CaptureRequest): string {
    const url = new URL(request.endpoint);
    if (request.query) url.searchParams.set("data", request.query);
    for (const [key, value] of Object.entries(request.params ?? {})) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}
