import { z } from "zod";

import type { GeoJsonFeatureCollection } from "@/features/map/geojsonTypes";
import { normalizeTransitLineQuestion } from "@/features/questions/transitLine/transitLineNormalization";
import type { QuestionsImportState } from "@/features/questions/questionTypes";
import type { HidingZoneImportState } from "@/state/hidingZoneStore";
import type { PlayAreaImportState } from "@/state/playAreaStore";
import type { QuestionSettingsImportState } from "@/state/questionStore";

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

const radarDistanceOptionSchema = z.enum([
    "500m",
    "1km",
    "2km",
    "5km",
    "10km",
    "15km",
    "40km",
    "80km",
    "150km",
    "other",
]);
const questionAnswerSchema = z
    .enum(["unanswered", "positive", "negative"])
    .default("unanswered");

export const appStateRadarQuestionSchema = z.object({
    answer: questionAnswerSchema,
    center: positionSchema,
    createdAt: z.string().min(1),
    distanceMeters: z.number().positive(),
    distanceOption: radarDistanceOptionSchema,
    distanceUnit: z.enum(["m", "km", "mi"]),
    id: z.string().min(1),
    type: z.literal("radar"),
    updatedAt: z.string().min(1),
});
const matchingCategorySchema = z.enum([
    "transit-line",
    "station-name-length",
    "commercial-airport",
    "admin-1st",
    "admin-2nd",
    "admin-3rd",
    "admin-4th",
    "mountain",
    "landmark",
    "park",
    "amusement-park",
    "zoo",
    "aquarium",
    "golf-course",
    "museum",
    "movie-theater",
    "hospital",
    "library",
    "foreign-consulate",
]);

const appStateMatchingQuestionSchema = z
    .object({
        answer: questionAnswerSchema,
        candidates: z
            .array(
                z.object({
                    lat: z.number(),
                    lon: z.number(),
                    name: z.string(),
                    osmId: z.number(),
                    osmType: z.enum(["node", "way", "relation"]),
                    tags: z.record(z.string()),
                }),
            )
            .default([]),
        category: matchingCategorySchema.default("transit-line"),
        center: positionSchema,
        createdAt: z.string().min(1),
        id: z.string().min(1),
        lineId: z.string().min(1).nullable(),
        lineName: z.string().min(1).nullable(),
        selectedOsmId: z.number().int().positive().nullable().default(null),
        selectedOsmType: z
            .enum(["node", "way", "relation"])
            .nullable()
            .default(null),
        targetName: z.string().min(1).nullable().default(null),
        targetOsmId: z.number().int().positive().nullable().default(null),
        targetOsmType: z
            .enum(["node", "way", "relation"])
            .nullable()
            .default(null),
        type: z.literal("matching"),
        updatedAt: z.string().min(1),
    })
    .transform(normalizeTransitLineQuestion);

const appStateLegacyRadiusQuestionSchema = z
    .object({
        center: positionSchema,
        createdAt: z.string().min(1),
        id: z.string().min(1),
        radiusMeters: z.number().positive(),
        radiusOption: radarDistanceOptionSchema,
        radiusUnit: z.enum(["m", "km", "mi"]),
        type: z.literal("radius"),
        updatedAt: z.string().min(1),
    })
    .transform((question) => ({
        answer: "unanswered" as const,
        center: question.center,
        createdAt: question.createdAt,
        distanceMeters: question.radiusMeters,
        distanceOption: question.radiusOption,
        distanceUnit: question.radiusUnit,
        id: question.id,
        type: "radar" as const,
        updatedAt: question.updatedAt,
    }));

export const appStateQuestionsSchema = z.array(
    z.union([
        appStateRadarQuestionSchema,
        appStateLegacyRadiusQuestionSchema,
        appStateMatchingQuestionSchema,
    ]),
);

export const appStateQuestionSettingsSchema = z.object({
    isPinLocked: z.boolean(),
});

export const appStateV1Schema = z.object({
    hidingZones: appStateHidingZonesSchema,
    metadata: z.object({
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1),
    }),
    playArea: appStatePlayAreaSchema,
    questionSettings: appStateQuestionSettingsSchema,
    questions: appStateQuestionsSchema,
    version: z.literal(1),
});

export type AppStateV1 = z.infer<typeof appStateV1Schema>;
export type AppStateHidingZonesV1 = z.infer<typeof appStateHidingZonesSchema>;
export type AppStatePlayAreaV1 = z.infer<typeof appStatePlayAreaSchema>;
export type AppStateQuestionSettingsV1 = z.infer<
    typeof appStateQuestionSettingsSchema
>;

export function createAppStateV1({
    hidingZones,
    metadata,
    now = new Date(),
    playArea,
    questionSettings,
    questions,
}: {
    hidingZones: HidingZoneImportState;
    metadata?: {
        createdAt?: string;
        updatedAt?: string;
    };
    now?: Date;
    playArea: PlayAreaImportState;
    questionSettings?: QuestionSettingsImportState;
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
        questionSettings: {
            isPinLocked: questionSettings?.isPinLocked ?? false,
        },
        questions: questions ? [...questions] : [],
        version: 1,
    };
}

export function migratePersistedAppState(value: unknown): AppStateV1 | null {
    const parsed = appStateV1Schema.safeParse(addMissingV1Slices(value));
    return parsed.success ? parsed.data : null;
}

function addMissingV1Slices(value: unknown): unknown {
    if (!isRecord(value)) return value;
    if (value.version !== 1) return value;
    const playAreaCenter = getPlayAreaCenter(value);
    const questions =
        "questions" in value
            ? addMissingQuestionCenters(value.questions, playAreaCenter)
            : [];

    return {
        ...value,
        questionSettings:
            "questionSettings" in value
                ? value.questionSettings
                : { isPinLocked: false },
        questions,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addMissingQuestionCenters(
    questions: unknown,
    fallbackCenter: unknown,
): unknown {
    if (!Array.isArray(questions)) return questions;
    return questions.map((question) => {
        if (
            !isRecord(question) ||
            question.type !== "matching" ||
            "center" in question ||
            !isPosition(fallbackCenter)
        ) {
            return question;
        }
        return {
            ...question,
            center: fallbackCenter,
        };
    });
}

function getPlayAreaCenter(value: Record<string, unknown>): unknown {
    const playArea = value.playArea;
    return isRecord(playArea) ? playArea.center : null;
}

function isPosition(value: unknown): value is [number, number] {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
    );
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

export function appStateQuestionSettingsToImportState(
    questionSettings: AppStateQuestionSettingsV1,
): QuestionSettingsImportState {
    return {
        isPinLocked: questionSettings.isPinLocked,
    };
}
