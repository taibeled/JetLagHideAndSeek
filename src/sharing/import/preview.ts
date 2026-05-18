import type { AppStateEnvelopeV1, WireEnvelope } from "@/sharing/wire/schema";

export type ImportPreview = {
    detail: string;
    envelope: AppStateEnvelopeV1;
    gameId: string;
    title: string;
};

export function buildImportPreview(envelope: WireEnvelope): ImportPreview {
    return {
        detail: summarizeAppState(envelope),
        envelope,
        gameId: envelope.payload.gameId,
        title: "Shared Game Setup",
    };
}

function summarizeAppState(envelope: AppStateEnvelopeV1): string {
    const playArea = envelope.payload.playArea?.label ?? "Unknown play area";
    const hidingZones = envelope.payload.hidingZones;
    if (!hidingZones) return playArea;

    const presetLabel = `${hidingZones.selectedPresetIds.length} preset${
        hidingZones.selectedPresetIds.length === 1 ? "" : "s"
    }`;
    const questionCount = envelope.payload.questions?.length ?? 0;
    const questionLabel =
        questionCount > 0
            ? ` · ${questionCount} question${questionCount === 1 ? "" : "s"}`
            : "";
    return `${playArea} · ${presetLabel} · ${Math.round(
        hidingZones.radiusMeters,
    )} m radius${questionLabel}`;
}
