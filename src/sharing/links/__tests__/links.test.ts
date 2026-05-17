import { buildAppStateEnvelope } from "@/sharing/export/buildEnvelope";
import { buildImportLink } from "@/sharing/links/buildLink";
import { parseImportLink } from "@/sharing/links/parseLink";

const envelope = buildAppStateEnvelope({
    gameId: "game-1",
    hidingZones: {
        radiusMeters: 600,
        radiusUnit: "m",
        selectedPresetIds: [],
    },
    now: new Date("2026-05-17T00:00:00.000Z"),
    playArea: {
        bbox: [1, 2, 3, 4],
        boundary: { features: [], type: "FeatureCollection" },
        center: [2, 3],
        label: "Test Area",
        osmId: 123,
        osmType: "R",
    },
});

describe("sharing links", () => {
    it("builds and parses custom-scheme import links", () => {
        const link = buildImportLink({ envelope, mode: "custom-scheme" });

        expect(link).toMatch(/^jetlag-hide-seek-v2:\/\/import\?d=/);

        const parsed = parseImportLink(link);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            const result = parsed.envelope;
            expect(parsed.source).toBe("payload");
            expect(result.kind).toBe("app-state");
            expect(result.version).toBe(1);
            expect(result.payload.gameId).toBe("game-1");
            expect(result.payload.playArea?.label).toBe("Test Area");
            expect(result.payload.playArea?.osmId).toBe(123);
            expect(result.payload.playArea?.center[0]).toBeCloseTo(2, 4);
            expect(result.payload.playArea?.center[1]).toBeCloseTo(3, 4);
            expect(result.payload.hidingZones?.radiusMeters).toBe(600);
            expect(result.payload.hidingZones?.radiusUnit).toBe("m");
            expect(result.payload.playArea?.osmType).toBe("R");
        }
    });
});
