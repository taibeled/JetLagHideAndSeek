export function resolveE2ePlatform(explicitPlatform, hostPlatform) {
    const resolved =
        explicitPlatform ?? (hostPlatform === "linux" ? "android" : "ios");

    if (resolved !== "android" && resolved !== "ios") {
        throw new Error(
            `Unknown E2E_PLATFORM "${resolved}". Expected android or ios.`,
        );
    }

    return resolved;
}

export function createMetroWarmUrl(metroPort, e2ePlatform) {
    return `http://127.0.0.1:${metroPort}/node_modules/expo-router/entry.js?platform=${e2ePlatform}&dev=true&minify=false`;
}

export function selectFlows(flows, selectedFlow) {
    if (selectedFlow === "all") return flows;

    const selected = flows.find((flow) => flow.name === selectedFlow);
    if (!selected) {
        throw new Error(
            `Unknown E2E_FLOW "${selectedFlow}". Expected all or one of: ${flows
                .map((flow) => flow.name)
                .join(", ")}.`,
        );
    }

    if (selected.name === "warmup") return [selected];

    const warmup = flows.find((flow) => flow.name === "warmup");
    return warmup ? [warmup, selected] : [selected];
}
