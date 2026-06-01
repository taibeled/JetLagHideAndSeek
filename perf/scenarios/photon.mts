import {
    clearPlayAreaSearchCache,
    mapPhotonFeaturesToPlayAreaResults,
    searchPlayAreas,
} from "../../src/features/playArea/playAreaSearch.ts";
import {
    loadCapture,
    perfPath,
    type CaptureEnvelope,
    type PerfScenario,
} from "../lib.mts";
import {
    LatestResponse,
    MemoryCacheStorage,
    ReplayCache,
} from "../models/replay-cache.mts";

type PhotonPayload = { features?: unknown[] };

const tokyo = capture("tokyo.json");
const osaka = capture("osaka.json");
const shibuya = capture("shibuya.json");

export const photonScenarios: PerfScenario[] = [
    parseScenario("photon/tokyo-parse", tokyo),
    parseScenario("photon/osaka-parse", osaka),
    parseScenario("photon/shibuya-parse", shibuya),
    {
        fixtureHash: tokyo.responseSha256,
        group: "photon",
        iterations: 20,
        name: "photon/tokyo-search-cold",
        setup: () => {
            clearPlayAreaSearchCache();
            installFixtureFetch(tokyo);
        },
        run: async () => ({
            output: await searchPlayAreas("Tokyo"),
        }),
        warmups: 3,
    },
    {
        fixtureHash: tokyo.responseSha256,
        group: "photon",
        iterations: 30,
        name: "photon/tokyo-search-memory-hit",
        setup: async () => {
            clearPlayAreaSearchCache();
            installFixtureFetch(tokyo);
            await searchPlayAreas("Tokyo");
        },
        run: async () => ({
            metrics: { expectedNetworkIntents: 0 },
            output: await searchPlayAreas("  TOKYO  "),
        }),
        warmups: 5,
    },
    {
        fixtureHash: tokyo.responseSha256,
        group: "photon-cache-prototype",
        iterations: 30,
        name: "photon-cache-prototype/stale-hit-background-refresh",
        run: async () => {
            const storage = new MemoryCacheStorage();
            const cache = new ReplayCache<
                ReturnType<typeof mapPhotonFeaturesToPlayAreaResults>
            >(storage, () => 10_000, 5000);
            const results = mapPhotonFeaturesToPlayAreaResults(
                (tokyo.payload.features ?? []) as Parameters<
                    typeof mapPhotonFeaturesToPlayAreaResults
                >[0],
            );
            await cache.seed("tokyo", { cachedAt: 1000, value: results });
            let networkIntents = 0;
            const hit = await cache.get("tokyo", async () => {
                networkIntents += 1;
                return results;
            });
            await Promise.resolve();
            return {
                metrics: { networkIntents, source: hit.source },
                output: hit.value,
            };
        },
        warmups: 5,
    },
    {
        fixtureHash: tokyo.responseSha256,
        group: "photon-cache-prototype",
        iterations: 30,
        name: "photon-cache-prototype/latest-response-wins",
        run: async () => {
            const latest = new LatestResponse<string>();
            let finishOlder!: (value: string) => void;
            const older = latest.request(
                () =>
                    new Promise((resolve) => {
                        finishOlder = resolve;
                    }),
            );
            const newer = latest.request(async () => "newer");
            await newer;
            finishOlder("older");
            await older;
            return { output: latest.current() };
        },
        warmups: 5,
    },
];

function capture(relative: string): CaptureEnvelope<PhotonPayload> {
    return loadCapture(
        perfPath("fixtures/photon", relative),
    ) as CaptureEnvelope<PhotonPayload>;
}

function parseScenario(
    name: string,
    envelope: CaptureEnvelope<PhotonPayload>,
): PerfScenario {
    return {
        fixtureHash: envelope.responseSha256,
        group: "photon",
        iterations: 30,
        name,
        run: () => ({
            metrics: { rawFeatures: envelope.payload.features?.length ?? 0 },
            output: mapPhotonFeaturesToPlayAreaResults(
                (envelope.payload.features ?? []) as Parameters<
                    typeof mapPhotonFeaturesToPlayAreaResults
                >[0],
            ),
        }),
        warmups: 5,
    };
}

function installFixtureFetch(envelope: CaptureEnvelope<PhotonPayload>): void {
    globalThis.fetch = async () =>
        ({
            json: async () => envelope.payload,
            ok: true,
            status: 200,
        }) as Response;
}
