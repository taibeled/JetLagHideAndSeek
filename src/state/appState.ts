import { z } from "zod";

import type { GeoJsonFeatureCollection } from "@/features/map/geojsonTypes";
import type { QuestionsImportState } from "@/features/questions/questionTypes";
import type { HidingZoneImportState } from "@/state/hidingZoneStore";
import type { PlayAreaImportState } from "@/state/playAreaStore";

const positionSchema = z.tuple([z.number(), z.number()]);
const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const featureCollectionSchema = z
    .object({
        features: z.array(z.unknown()),
        type: z.literal("FeatureCollection"),
    })
    .passthrough() as z.ZodType<GeoJsonFeatureCollection>;

export const appStatePlayAreaSchema = z.object({
    bbox: bboxSchema,
    boundary: featureCollectionSchema,
    center: positionSchema,
    label: z.string().min(1),
    osmId: z.number().int().positive(),
    osmType: z.literal("R"),
});

export const appStateHidingZonesSchema = z.object({
    radiusMeters: z.number().positive(),
    radiusUnit: z.enum(["m", "km", "mi"]),
    selectedPresetIds: z.array(z.string()),
});

export const appStateRadiusQuestionSchema = z.object({
    center: positionSchema,
    createdAt: z.string().min(1),
    id: z.string().min(1),
    radiusMeters: z.number().positive(),
    radiusOption: z.enum(["500m", "1km", "2km", "5km", "10km", "other"]),
    radiusUnit: z.enum(["m", "km", "mi"]),
    type: z.literal("radius"),
    updatedAt: z.string().min(1),
});

export const appStateQuestionsSchema = z.array(appStateRadiusQuestionSchema);

export const appStateV1Schema = z.object({
    hidingZones: appStateHidingZonesSchema,
    metadata: z.object({
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1),
    }),
    playArea: appStatePlayAreaSchema,
    questions: appStateQuestionsSchema,
    version: z.literal(1),
});

export type AppStateV1 = z.infer<typeof appStateV1Schema>;
export type AppStateHidingZonesV1 = z.infer<typeof appStateHidingZonesSchema>;
export type AppStatePlayAreaV1 = z.infer<typeof appStatePlayAreaSchema>;

export function createAppStateV1({
    hidingZones,
    metadata,
    now = new Date(),
    playArea,
    questions,
}: {
    hidingZones: HidingZoneImportState;
    metadata?: {
        createdAt?: string;
        updatedAt?: string;
    };
    now?: Date;
    playArea: PlayAreaImportState;
    questions?: QuestionsImportState;
}): AppStateV1 {
    const timestamp = now.toISOString();
    return {
        hidingZones: {
            radiusMeters: hidingZones.radiusMeters,
            radiusUnit: hidingZones.radiusUnit,
            selectedPresetIds: [...hidingZones.selectedPresetIds],
        },
        metadata: {
            createdAt: metadata?.createdAt ?? timestamp,
            updatedAt: metadata?.updatedAt ?? timestamp,
        },
        playArea: {
            bbox: playArea.bbox,
            boundary: playArea.boundary,
            center: playArea.center,
            label: playArea.label,
            osmId: playArea.osmId,
            osmType: playArea.osmType,
        },
        questions: questions ? [...questions] : [],
        version: 1,
    };
}

export function migratePersistedAppState(value: unknown): AppStateV1 | null {
    const parsed = appStateV1Schema.safeParse(addMissingQuestionsSlice(value));
    return parsed.success ? parsed.data : null;
}

function addMissingQuestionsSlice(value: unknown): unknown {
    if (!isRecord(value)) return value;
    if (value.version !== 1) return value;
    if ("questions" in value) return value;

    return {
        ...value,
        questions: [],
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function appStatePlayAreaToImportState(
    playArea: AppStatePlayAreaV1,
): PlayAreaImportState {
    return {
        bbox: playArea.bbox,
        boundary: playArea.boundary,
        center: playArea.center,
        label: playArea.label,
        osmId: playArea.osmId,
        osmType: playArea.osmType,
    };
}

export function appStateHidingZonesToImportState(
    hidingZones: AppStateHidingZonesV1,
): HidingZoneImportState {
    return {
        radiusMeters: hidingZones.radiusMeters,
        radiusUnit: hidingZones.radiusUnit,
        selectedPresetIds: [...hidingZones.selectedPresetIds],
    };
}
