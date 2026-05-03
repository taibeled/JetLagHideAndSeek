import { describe, expect, it, vi } from "vitest";
import { getTestStorage, useTestStorageEngine } from "@nanostores/persistent";

// This must be called BEFORE any persistentAtom is created.
// Since this file imports context dynamically, the engine is
// configured before persistentAtom is instantiated.
useTestStorageEngine();

describe("customPresets localStorage operations", () => {
    it("saves and retrieves presets via persistent storage", async () => {
        const mod = await import("@/lib/context");
        mod.customPresets.set([]);

        const preset = mod.saveCustomPreset({
            name: "StoredPreset",
            type: "custom",
            data: { x: 1 },
        });

        // Verify the store reflects the save
        expect(mod.customPresets.get()).toHaveLength(1);
        expect(mod.customPresets.get()[0]!.name).toBe("StoredPreset");

        // Verify nanostores' test storage engine captured the write
        const raw = getTestStorage()["customPresets"];
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!);
        expect(parsed[0].name).toBe("StoredPreset");
    });

    it("recovers from pre-populated storage on init", async () => {
        // Pre-populate the test storage with serialized presets
        const preloaded = JSON.stringify([
            {
                id: "preloaded",
                name: "PreloadedPreset",
                type: "custom",
                data: {},
                createdAt: "2024-01-01T00:00:00.000Z",
            },
        ]);
        getTestStorage()["customPresets"] = preloaded;

        // Reset modules and re-import so persistentAtom re-runs restore()
        vi.resetModules();
        const mod = await import("@/lib/context");

        // Verify the atom ingested the pre-populated data
        const presets = mod.customPresets.get();
        expect(presets).toHaveLength(1);
        expect(presets[0]!.name).toBe("PreloadedPreset");
        expect(presets[0]!.id).toBe("preloaded");
    });
});
