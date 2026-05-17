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
        expect(parseImportLink(link)).toEqual({
            envelope,
            ok: true,
            source: "payload",
        });
    });
});
