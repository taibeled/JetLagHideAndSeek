import { z } from "zod";

/** Matches server validation; team id is capability token. */
export const TEAM_ID_REGEX = /^[A-Za-z0-9_-]{16,32}$/;

export const teamSchema = z.object({
    id: z.string().regex(TEAM_ID_REGEX),
    name: z.string(),
});

/** Wire envelope: v1 plus full hiding-zone payload (passthrough). */
export const wireV1SnapshotSchema = z
    .object({
        v: z.literal(1),
        team: teamSchema.optional(),
    })
    .passthrough();

export type WireV1Snapshot = z.infer<typeof wireV1SnapshotSchema>;

function sortKeysDeep(value: unknown): unknown {
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sortKeysDeep);
    }
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
        const v = obj[key];
        if (v === undefined) continue;
        sorted[key] = sortKeysDeep(v);
    }
    return sorted;
}

/** Deterministic JSON: sorted keys at every object depth, no undefined keys. */
export function canonicalize(value: unknown): string {
    return JSON.stringify(sortKeysDeep(value));
}

export function buildWireV1Envelope(hidingZoneValue: Record<string, unknown>) {
    return { v: 1 as const, ...hidingZoneValue };
}

export function stripWireEnvelope(snapshot: WireV1Snapshot): {
    geo: Record<string, unknown>;
    team: { id: string; name: string } | null;
} {
    const { v: _v, team, ...rest } = snapshot;
    return {
        geo: rest as Record<string, unknown>,
        team: team ?? null,
    };
}
