import type { HidingZonePreset } from "./hidingZoneTypes";

type RawPresetData = {
    presets: HidingZonePreset[];
};

let cachedPresets: HidingZonePreset[] | null = null;
let loadPromise: Promise<HidingZonePreset[]> | null = null;

/**
 * Load the hiding-zone preset JSON asynchronously. The 294 KB preset file is
 * loaded via dynamic `import()` so it doesn't block the JS thread during
 * initial bundle evaluation.
 *
 * Safe to call multiple times — the result is cached after the first load.
 */
export async function loadHidingZonePresets(): Promise<HidingZonePreset[]> {
    if (cachedPresets) return cachedPresets;

    if (!loadPromise) {
        loadPromise = import(
            "../../../data/odpt/generated/hiding-zone-presets.json"
        ).then((raw) => {
            const data = raw as unknown as RawPresetData;
            cachedPresets = data.presets;
            return cachedPresets;
        });
    }

    return loadPromise;
}

/**
 * Returns the already-loaded presets. Throws if {@link loadHidingZonePresets}
 * hasn't resolved yet — callers must ensure the data is loaded first.
 */
export function getHidingZonePresets(): HidingZonePreset[] {
    if (!cachedPresets) {
        throw new Error(
            "Hiding zone presets not loaded yet. " +
                "Call loadHidingZonePresets() first.",
        );
    }
    return cachedPresets;
}

/**
 * Synchronous fallback for consumers that can't wait for async load.
 * Returns an empty array, so no presets are suggested until the real data
 * arrives. Once loaded, the provider re-renders with the full dataset.
 */
export function getHidingZonePresetsOrEmpty(): HidingZonePreset[] {
    return cachedPresets ?? [];
}
