import type { HidingZoneUnit } from "@/features/hidingZone/hidingZoneTypes";
import type { PlayArea } from "@/features/map/playArea";
import type { AppStateEnvelopeV1 } from "@/sharing/wire/schema";

export type HidingZoneExportState = {
    radiusMeters: number;
    radiusUnit: HidingZoneUnit;
    selectedPresetIds: string[];
};

export function buildAppStateEnvelope({
    gameId = createGameId(),
    hidingZones,
    now = new Date(),
    playArea,
}: {
    gameId?: string;
    hidingZones: HidingZoneExportState;
    now?: Date;
    playArea: PlayArea;
}): AppStateEnvelopeV1 {
    const timestamp = now.toISOString();

    return {
        kind: "app-state",
        payload: {
            gameId,
            hidingZones: {
                radiusMeters: hidingZones.radiusMeters,
                radiusUnit: hidingZones.radiusUnit,
                selectedPresetIds: [...hidingZones.selectedPresetIds],
            },
            metadata: {
                createdAt: timestamp,
                updatedAt: timestamp,
            },
            playArea: {
                bbox: playArea.bbox,
                center: playArea.center,
                label: playArea.label,
                osmId: playArea.osmId,
                osmType: playArea.osmType,
            },
        },
        version: 1,
    };
}

function createGameId(): string {
    return `s-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
}
