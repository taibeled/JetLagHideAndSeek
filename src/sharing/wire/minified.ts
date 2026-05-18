import { z } from "zod";

import type { AppStateEnvelopeV1, WireEnvelope } from "./schema";

export const FIELD_MAP = {
    center: "n",
    createdAt: "c",
    gameId: "g",
    hidingZones: "h",
    kind: "k",
    label: "l",
    metadata: "m",
    osmId: "o",
    payload: "p",
    playArea: "a",
    radiusMeters: "r",
    selectedPresetIds: "s",
    version: "v",
} as const;

type ForwardKey = keyof typeof FIELD_MAP;
type ReverseKey = (typeof FIELD_MAP)[ForwardKey];

const REVERSE_FIELD_MAP: Record<ReverseKey, ForwardKey> = {} as Record<
    ReverseKey,
    ForwardKey
>;
for (const [full, min] of Object.entries(FIELD_MAP)) {
    REVERSE_FIELD_MAP[min as ReverseKey] = full as ForwardKey;
}

export const COORD_FACTOR = 1e6;

const compactCoordSchema = z.tuple([z.number().int(), z.number().int()]);

const playAreaMinifiedSchema = z.object({
    [FIELD_MAP.center]: compactCoordSchema,
    [FIELD_MAP.label]: z.string().min(1),
    [FIELD_MAP.osmId]: z.number(),
});

const hidingZonesMinifiedSchema = z.object({
    [FIELD_MAP.radiusMeters]: z.number().nonnegative(),
    [FIELD_MAP.selectedPresetIds]: z.array(z.string()),
});

const metadataMinifiedSchema = z.object({
    [FIELD_MAP.createdAt]: z.string().min(1),
});

const appStatePayloadMinifiedSchema = z.object({
    [FIELD_MAP.gameId]: z.string().min(1),
    [FIELD_MAP.hidingZones]: hidingZonesMinifiedSchema.optional(),
    [FIELD_MAP.metadata]: metadataMinifiedSchema,
    [FIELD_MAP.playArea]: playAreaMinifiedSchema.optional(),
});

const appStateEnvelopeMinifiedSchema = z.object({
    [FIELD_MAP.kind]: z.literal("app-state"),
    [FIELD_MAP.version]: z.literal(1),
    [FIELD_MAP.payload]: appStatePayloadMinifiedSchema,
});

export const wireEnvelopeMinifiedSchema = z.discriminatedUnion(FIELD_MAP.kind, [
    appStateEnvelopeMinifiedSchema,
]);

export type CompactCoord = z.infer<typeof compactCoordSchema>;
export type AppStatePayloadMinified = z.infer<
    typeof appStatePayloadMinifiedSchema
>;
export type AppStateEnvelopeMinified = z.infer<
    typeof appStateEnvelopeMinifiedSchema
>;
export type WireEnvelopeMinified = z.infer<typeof wireEnvelopeMinifiedSchema>;

export function compactCoord(lon: number, lat: number): CompactCoord {
    return [Math.round(lon * COORD_FACTOR), Math.round(lat * COORD_FACTOR)];
}

export function uncompactCoord(
    lonInt: number,
    latInt: number,
): [number, number] {
    return [lonInt / COORD_FACTOR, latInt / COORD_FACTOR];
}

const POLYLINE_HEADER_SIZE = 3;
const POLYLINE_BASE_LON = 0;
const POLYLINE_BASE_LAT = 1;
const POLYLINE_COUNT = 2;

export type CompactPolyline = number[];

export function compactPolyline(coords: [number, number][]): CompactPolyline {
    if (coords.length === 0) return [0, 0, 0];

    const ints = coords.map(([lon, lat]) => compactCoord(lon, lat));
    const result: number[] = [ints[0][0], ints[0][1], ints.length];

    for (let i = 1; i < ints.length; i++) {
        result.push(ints[i][0] - ints[i - 1][0]);
        result.push(ints[i][1] - ints[i - 1][1]);
    }

    return result;
}

export function uncompactPolyline(
    encoded: CompactPolyline,
): [number, number][] {
    if (
        encoded.length < POLYLINE_HEADER_SIZE ||
        encoded[POLYLINE_COUNT] === 0
    ) {
        return [];
    }

    const result: [number, number][] = [
        uncompactCoord(encoded[POLYLINE_BASE_LON], encoded[POLYLINE_BASE_LAT]),
    ];

    let lon = encoded[POLYLINE_BASE_LON];
    let lat = encoded[POLYLINE_BASE_LAT];
    const count = encoded[POLYLINE_COUNT];

    for (
        let i = POLYLINE_HEADER_SIZE;
        i < POLYLINE_HEADER_SIZE + (count - 1) * 2;
        i += 2
    ) {
        lon += encoded[i];
        lat += encoded[i + 1];
        result.push(uncompactCoord(lon, lat));
    }

    return result;
}

export function minifyEnvelope(env: WireEnvelope): WireEnvelopeMinified {
    if (env.kind !== "app-state") {
        throw new Error(`Cannot minify unsupported envelope kind: ${env.kind}`);
    }

    const appState = env as AppStateEnvelopeV1;
    const p = appState.payload;
    const mini: Record<string, unknown> = {};

    mini[FIELD_MAP.kind] = appState.kind;
    mini[FIELD_MAP.version] = appState.version;

    const payload: Record<string, unknown> = {};
    payload[FIELD_MAP.gameId] = p.gameId;

    if (p.hidingZones) {
        payload[FIELD_MAP.hidingZones] = {
            [FIELD_MAP.radiusMeters]: p.hidingZones.radiusMeters,
            [FIELD_MAP.selectedPresetIds]: p.hidingZones.selectedPresetIds,
        };
    }

    if (p.playArea) {
        payload[FIELD_MAP.playArea] = {
            [FIELD_MAP.center]: compactCoord(
                p.playArea.center[0],
                p.playArea.center[1],
            ),
            [FIELD_MAP.label]: p.playArea.label,
            [FIELD_MAP.osmId]: p.playArea.osmId,
        };
    }

    mini[FIELD_MAP.payload] = payload;
    return mini as unknown as WireEnvelopeMinified;
}

export function unminifyEnvelope(
    mini: WireEnvelopeMinified,
): AppStateEnvelopeV1 {
    const p = mini[FIELD_MAP.payload] as AppStatePayloadMinified;
    const full: Record<string, unknown> = {};

    full.kind = mini[FIELD_MAP.kind];
    full.version = mini[FIELD_MAP.version];

    const metadata = p[FIELD_MAP.metadata];
    const createdAt = metadata[FIELD_MAP.createdAt];

    const payload: Record<string, unknown> = {
        gameId: p[FIELD_MAP.gameId],
        metadata: {
            createdAt,
            updatedAt: createdAt,
        },
    };

    if (p[FIELD_MAP.hidingZones]) {
        const hz = p[FIELD_MAP.hidingZones]!;
        payload.hidingZones = {
            radiusMeters: hz[FIELD_MAP.radiusMeters],
            radiusUnit: "m",
            selectedPresetIds: hz[FIELD_MAP.selectedPresetIds],
        };
    }

    if (p[FIELD_MAP.playArea]) {
        const pa = p[FIELD_MAP.playArea]!;
        const [lon, lat] = uncompactCoord(
            pa[FIELD_MAP.center][0],
            pa[FIELD_MAP.center][1],
        );
        payload.playArea = {
            bbox: [0, 0, 0, 0],
            center: [lon, lat],
            label: pa[FIELD_MAP.label],
            osmId: pa[FIELD_MAP.osmId],
            osmType: "R",
        };
    }

    full.payload = payload;
    return full as unknown as AppStateEnvelopeV1;
}
