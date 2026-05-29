// Full-key schemas for internal use.
// The wire format uses minified keys. See ../minified.ts
// for the FIELD_MAP and minified schemas.
import { z } from "zod";

import type { GeoJsonFeatureCollection } from "@/features/map/geojsonTypes";

const positionSchema = z.tuple([z.number(), z.number()]);
const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const featureCollectionSchema = z
    .object({
        features: z.array(z.unknown()),
        type: z.literal("FeatureCollection"),
    })
    .passthrough() as z.ZodType<GeoJsonFeatureCollection>;

export const playAreaWireSchema = z.object({
    bbox: bboxSchema,
    boundary: featureCollectionSchema.optional(),
    center: positionSchema,
    label: z.string().min(1),
    osmId: z.number(),
    osmType: z.literal("R"),
});

export const hidingZonesWireSchema = z.object({
    radiusMeters: z.number().nonnegative(),
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

export const radarQuestionWireSchema = z.object({
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
export const matchingQuestionWireSchema = z.object({
    answer: questionAnswerSchema,
    center: positionSchema,
    createdAt: z.string().min(1),
    id: z.string().min(1),
    lineId: z.string().min(1).nullable(),
    lineName: z.string().min(1).nullable(),
    type: z.literal("matching"),
    updatedAt: z.string().min(1),
});

const legacyRadiusQuestionWireSchema = z
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

export const appStatePayloadSchema = z.object({
    gameId: z.string().min(1),
    hidingZones: hidingZonesWireSchema.optional(),
    metadata: z.object({
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1),
    }),
    playArea: playAreaWireSchema.optional(),
    questions: z
        .array(
            z.union([
                radarQuestionWireSchema,
                legacyRadiusQuestionWireSchema,
                matchingQuestionWireSchema,
            ]),
        )
        .optional(),
});

export const appStateEnvelopeSchema = z.object({
    kind: z.literal("app-state"),
    payload: appStatePayloadSchema,
    version: z.literal(1),
});

export const wireEnvelopeSchema = z.discriminatedUnion("kind", [
    appStateEnvelopeSchema,
]);

export type AppStateEnvelopeV1 = z.infer<typeof appStateEnvelopeSchema>;
export type AppStatePayloadV1 = z.infer<typeof appStatePayloadSchema>;
export type HidingZonesWireV1 = z.infer<typeof hidingZonesWireSchema>;
export type PlayAreaWireV1 = z.infer<typeof playAreaWireSchema>;
export type RadarQuestionWireV1 = z.infer<typeof radarQuestionWireSchema>;
export type WireEnvelope = z.infer<typeof wireEnvelopeSchema>;
