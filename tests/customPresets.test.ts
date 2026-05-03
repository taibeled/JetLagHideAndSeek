import { beforeEach, describe, expect, it } from "vitest";

import {
    customPresets,
    deleteCustomPreset,
    saveCustomPreset,
    updateCustomPreset,
} from "@/lib/context";

describe("customPresets CRUD", () => {
    beforeEach(() => {
        customPresets.set([]);
    });

    it("saveCustomPreset() adds preset and returns generated id", () => {
        const preset = saveCustomPreset({
            name: "TestPreset",
            type: "custom",
            data: { x: 1 },
        });
        expect(preset.id).toBeTruthy();
        expect(typeof preset.id).toBe("string");
        expect(preset.name).toBe("TestPreset");
        expect(preset.type).toBe("custom");
        expect(preset.data).toEqual({ x: 1 });
        expect(preset.createdAt).toBeTruthy();
        expect(customPresets.get()).toHaveLength(1);
    });

    it("updateCustomPreset(id, updates) updates only the matching preset", () => {
        const p1 = saveCustomPreset({
            name: "Alpha",
            type: "custom",
            data: { x: 1 },
        });
        const p2 = saveCustomPreset({
            name: "Beta",
            type: "custom",
            data: { y: 2 },
        });

        updateCustomPreset(p1.id, { name: "AlphaUpdated" });

        const presets = customPresets.get();
        expect(presets).toHaveLength(2);
        const updated = presets.find((p) => p.id === p1.id)!;
        expect(updated.name).toBe("AlphaUpdated");
        const unchanged = presets.find((p) => p.id === p2.id)!;
        expect(unchanged.name).toBe("Beta");
    });

    it("updateCustomPreset(unknownId, updates) leaves the store unchanged", () => {
        saveCustomPreset({ name: "Alpha", type: "custom", data: { x: 1 } });

        const before = customPresets.get();
        updateCustomPreset("non-existent-id", { name: "ShouldNotChange" });

        expect(customPresets.get()).toEqual(before);
    });

    it("deleteCustomPreset(id) removes only the matching preset", () => {
        const p1 = saveCustomPreset({
            name: "Alpha",
            type: "custom",
            data: { x: 1 },
        });
        saveCustomPreset({ name: "Beta", type: "custom", data: { y: 2 } });

        deleteCustomPreset(p1.id);

        const presets = customPresets.get();
        expect(presets).toHaveLength(1);
        expect(presets[0]!.name).toBe("Beta");
    });

    it("deleteCustomPreset(unknownId) leaves the store unchanged", () => {
        saveCustomPreset({ name: "Alpha", type: "custom", data: { x: 1 } });

        const before = customPresets.get();
        deleteCustomPreset("non-existent-id");

        expect(customPresets.get()).toEqual(before);
    });
});
