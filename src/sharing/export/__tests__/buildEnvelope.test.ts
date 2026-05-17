import { defaultPlayArea } from "@/features/map/playArea";
import { buildAppStateEnvelope } from "@/sharing/export/buildEnvelope";

describe("buildAppStateEnvelope", () => {
    it("exports the starting setup as an app-state envelope", () => {
        const envelope = buildAppStateEnvelope({
            gameId: "game-1",
            hidingZones: {
                radiusMeters: 800,
                radiusUnit: "m",
                selectedPresetIds: ["jr-yamanote"],
            },
            now: new Date("2026-05-17T00:00:00.000Z"),
            playArea: defaultPlayArea,
        });

        expect(envelope.kind).toBe("app-state");
        expect(envelope.version).toBe(1);
        expect(envelope.payload.playArea?.label).toBe("Tokyo 23 Wards");
        expect(envelope.payload.hidingZones).toEqual({
            radiusMeters: 800,
            radiusUnit: "m",
            selectedPresetIds: ["jr-yamanote"],
        });
    });
});
