import type { HidingZoneImportState } from "@/state/hidingZoneStore";
import type { PlayAreaImportState } from "@/state/playAreaStore";
import { knownPlayAreaPresets } from "@/features/map/playArea";
import type { PlayAreaWireV1, WireEnvelope } from "@/sharing/wire/schema";

export type AppStores = {
    hidingZones: {
        replaceSetup: (nextSetup: HidingZoneImportState) => void;
    };
    playArea: {
        importPlayArea: (playArea: PlayAreaImportState) => void;
    };
};

export type ImportApplyResult = { ok: true } | { error: string; ok: false };

export function applyImport({
    envelope,
    stores,
}: {
    envelope: WireEnvelope;
    stores: AppStores;
}): ImportApplyResult {
    if (envelope.kind !== "app-state") {
        return { error: "Unsupported share link type.", ok: false };
    }

    const { hidingZones, playArea } = envelope.payload;
    if (playArea) {
        const resolvedPlayArea = resolvePlayArea(playArea);
        if (!resolvedPlayArea) {
            return {
                error: "This setup references a play area that is not bundled in this app.",
                ok: false,
            };
        }
        stores.playArea.importPlayArea(resolvedPlayArea);
    }
    if (hidingZones) {
        stores.hidingZones.replaceSetup(hidingZones);
    }

    return { ok: true };
}

function resolvePlayArea(playArea: PlayAreaWireV1): PlayAreaImportState | null {
    if (playArea.boundary) {
        return {
            bbox: playArea.bbox,
            boundary: playArea.boundary,
            center: playArea.center,
            label: playArea.label,
            osmId: playArea.osmId,
            osmType: playArea.osmType,
        };
    }

    return (
        knownPlayAreaPresets.find(
            (preset) =>
                preset.osmId === playArea.osmId &&
                preset.osmType === playArea.osmType,
        ) ?? null
    );
}
