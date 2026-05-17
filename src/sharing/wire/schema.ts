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

export const appStatePayloadSchema = z.object({
    gameId: z.string().min(1),
    hidingZones: hidingZonesWireSchema.optional(),
    metadata: z.object({
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1),
    }),
    playArea: playAreaWireSchema.optional(),
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
export type WireEnvelope = z.infer<typeof wireEnvelopeSchema>;
