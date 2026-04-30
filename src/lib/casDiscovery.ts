import { normalizeCasBaseUrl, probeHealth } from "@/lib/cas";
import {
    casServerEffectiveUrl,
    casServerStatus,
    casServerUrl,
} from "@/lib/context";

/** Probe CAS API base URLs (root deploy first, then Astro base path, then user-configured). */
export async function discoverCasServer(): Promise<void> {
    const configured = casServerUrl.get().trim();
    const rawBase = import.meta.env.BASE_URL;
    const basePath = rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;

    const candidates: string[] = [
        window.location.origin,
        `${window.location.origin}${basePath}`,
    ];
    if (configured) {
        candidates.push(normalizeCasBaseUrl(configured));
    }

    const deduped = [...new Set(candidates)];

    for (const base of deduped) {
        if (await probeHealth(base)) {
            casServerEffectiveUrl.set(base);
            casServerStatus.set("available");
            return;
        }
    }

    casServerEffectiveUrl.set(null);
    casServerStatus.set("unavailable");
}
