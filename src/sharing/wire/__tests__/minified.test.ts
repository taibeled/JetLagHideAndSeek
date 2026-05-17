import { canonicalize } from "@/sharing/wire/canonicalize";
import {
    COORD_FACTOR,
    compactCoord,
    compactPolyline,
    FIELD_MAP,
    minifyEnvelope,
    uncompactCoord,
    uncompactPolyline,
    unminifyEnvelope,
} from "@/sharing/wire/minified";
import type { AppStateEnvelopeV1 } from "@/sharing/wire/schema";

function makeEnvelope(
    overrides?: Partial<AppStateEnvelopeV1["payload"]>,
): AppStateEnvelopeV1 {
    return {
        kind: "app-state",
        payload: {
            gameId: "test-game-1",
            hidingZones: {
                radiusMeters: 600,
                radiusUnit: "m",
                selectedPresetIds: ["preset-a", "preset-b"],
            },
            metadata: {
                createdAt: "2026-05-17T00:00:00.000Z",
                updatedAt: "2026-05-17T00:00:00.000Z",
            },
            playArea: {
                bbox: [139.5, 35.5, 139.9, 35.9],
                boundary: { features: [], type: "FeatureCollection" },
                center: [139.7, 35.7],
                label: "Test Area",
                osmId: 12345,
                osmType: "R",
            },
            ...overrides,
        },
        version: 1,
    };
}

describe("FIELD_MAP", () => {
    it("has no duplicate minified values", () => {
        const values = Object.values(FIELD_MAP);
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
    });

    it("covers all keys used in round-trip", () => {
        const envelope = makeEnvelope();
        const mini = minifyEnvelope(envelope);
        const restored = unminifyEnvelope(mini);

        expect(restored.kind).toBe(envelope.kind);
        expect(restored.version).toBe(envelope.version);
        expect(restored.payload.gameId).toBe(envelope.payload.gameId);
    });
});

describe("compactCoord", () => {
    it("round-trips within 0.5 / COORD_FACTOR degrees", () => {
        const [lon, lat] = [139.6917064, 35.6894875];
        const compacted = compactCoord(lon, lat);
        const [restoredLon, restoredLat] = uncompactCoord(
            compacted[0],
            compacted[1],
        );

        expect(Math.abs(restoredLon - lon)).toBeLessThan(0.5 / COORD_FACTOR);
        expect(Math.abs(restoredLat - lat)).toBeLessThan(0.5 / COORD_FACTOR);
    });

    it("handles zero coordinates", () => {
        expect(compactCoord(0, 0)).toEqual([0, 0]);
        expect(uncompactCoord(0, 0)).toEqual([0, 0]);
    });

    it("handles extreme coordinates", () => {
        const [lon, lat] = [-180, -90];
        const compacted = compactCoord(lon, lat);
        const [restoredLon, restoredLat] = uncompactCoord(
            compacted[0],
            compacted[1],
        );

        expect(restoredLon).toBeCloseTo(lon, 5);
        expect(restoredLat).toBeCloseTo(lat, 5);
    });

    it("handles positive extreme coordinates", () => {
        const [lon, lat] = [180, 90];
        const compacted = compactCoord(lon, lat);
        const [restoredLon, restoredLat] = uncompactCoord(
            compacted[0],
            compacted[1],
        );

        expect(restoredLon).toBeCloseTo(lon, 5);
        expect(restoredLat).toBeCloseTo(lat, 5);
    });

    it("produces integers that fit in safe integer range", () => {
        const compacted = compactCoord(180, 90);
        expect(Number.isSafeInteger(compacted[0])).toBe(true);
        expect(Number.isSafeInteger(compacted[1])).toBe(true);
    });
});

describe("compactPolyline", () => {
    it("round-trips a multi-point polyline", () => {
        const coords: [number, number][] = [
            [139.7, 35.7],
            [139.71, 35.71],
            [139.72, 35.72],
            [139.7, 35.7],
        ];
        const encoded = compactPolyline(coords);
        const decoded = uncompactPolyline(encoded);

        expect(decoded.length).toBe(coords.length);
        for (let i = 0; i < coords.length; i++) {
            expect(decoded[i][0]).toBeCloseTo(coords[i][0], 4);
            expect(decoded[i][1]).toBeCloseTo(coords[i][1], 4);
        }
    });

    it("round-trips a single-point polyline", () => {
        const coords: [number, number][] = [[139.7, 35.7]];
        const encoded = compactPolyline(coords);
        const decoded = uncompactPolyline(encoded);

        expect(decoded.length).toBe(1);
        expect(decoded[0][0]).toBeCloseTo(coords[0][0], 4);
        expect(decoded[0][1]).toBeCloseTo(coords[0][1], 4);
    });

    it("returns empty array for empty input", () => {
        expect(uncompactPolyline(compactPolyline([]))).toEqual([]);
    });

    it("returns empty array for invalid encoded data", () => {
        expect(uncompactPolyline([])).toEqual([]);
        expect(uncompactPolyline([0, 0, 0])).toEqual([]);
    });

    it("produces small delta values for adjacent points", () => {
        const coords: [number, number][] = [
            [139.7, 35.7],
            [139.7001, 35.7001],
            [139.7002, 35.7002],
        ];
        const encoded = compactPolyline(coords);
        expect(encoded[POLYLINE_HEADER_INDEX]).toBeGreaterThan(0);
        expect(encoded[POLYLINE_HEADER_INDEX]).toBeLessThan(200);
    });
});

const POLYLINE_HEADER_INDEX = 3;

describe("minifyEnvelope", () => {
    it("drops radiusUnit from hidingZones", () => {
        const envelope = makeEnvelope();
        const mini = minifyEnvelope(envelope);
        const json = JSON.parse(canonicalize(mini));

        expect(
            json[FIELD_MAP.payload][FIELD_MAP.hidingZones].radiusUnit,
        ).toBeUndefined();
        expect(
            json[FIELD_MAP.payload][FIELD_MAP.hidingZones][
                FIELD_MAP.radiusMeters
            ],
        ).toBe(600);
    });

    it("drops updatedAt from metadata", () => {
        const envelope = makeEnvelope();
        const mini = minifyEnvelope(envelope);
        const json = JSON.parse(canonicalize(mini));

        expect(
            json[FIELD_MAP.payload][FIELD_MAP.metadata].updatedAt,
        ).toBeUndefined();
        expect(
            json[FIELD_MAP.payload][FIELD_MAP.metadata][FIELD_MAP.createdAt],
        ).toBe("2026-05-17T00:00:00.000Z");
    });

    it("drops bbox, boundary, and osmType from playArea", () => {
        const envelope = makeEnvelope();
        const mini = minifyEnvelope(envelope);
        const json = JSON.parse(canonicalize(mini));

        const pa = json[FIELD_MAP.payload][FIELD_MAP.playArea];
        expect(pa.bbox).toBeUndefined();
        expect(pa.boundary).toBeUndefined();
        expect(pa.osmType).toBeUndefined();
    });

    it("converts center to compact integer coordinates", () => {
        const envelope = makeEnvelope();
        const mini = minifyEnvelope(envelope);
        const json = JSON.parse(canonicalize(mini));

        const center =
            json[FIELD_MAP.payload][FIELD_MAP.playArea][FIELD_MAP.center];
        expect(center).toEqual([
            Math.round(139.7 * COORD_FACTOR),
            Math.round(35.7 * COORD_FACTOR),
        ]);
        expect(Number.isInteger(center[0])).toBe(true);
        expect(Number.isInteger(center[1])).toBe(true);
    });

    it("handles missing hidingZones", () => {
        const envelope = makeEnvelope({ hidingZones: undefined });
        const mini = minifyEnvelope(envelope);
        const json = JSON.parse(canonicalize(mini));

        expect(json[FIELD_MAP.payload][FIELD_MAP.hidingZones]).toBeUndefined();
    });

    it("handles missing playArea", () => {
        const envelope = makeEnvelope({ playArea: undefined });
        const mini = minifyEnvelope(envelope);
        const json = JSON.parse(canonicalize(mini));

        expect(json[FIELD_MAP.payload][FIELD_MAP.playArea]).toBeUndefined();
    });

    it("uses short keys in the output", () => {
        const envelope = makeEnvelope();
        const mini = minifyEnvelope(envelope);
        const json = JSON.parse(canonicalize(mini));

        expect(json.k).toBe("app-state");
        expect(json.v).toBe(1);
        expect(json.p.g).toBe("test-game-1");
        expect(json.p.h.r).toBe(600);
        expect(json.p.h.s).toEqual(["preset-a", "preset-b"]);
        expect(json.p.m.c).toBe("2026-05-17T00:00:00.000Z");
        expect(json.p.a.n).toBeDefined();
        expect(json.p.a.l).toBe("Test Area");
        expect(json.p.a.o).toBe(12345);

        expect(json.kind).toBeUndefined();
        expect(json.version).toBeUndefined();
        expect(json.payload).toBeUndefined();
    });

    it("handles empty selectedPresetIds", () => {
        const envelope = makeEnvelope({
            hidingZones: {
                radiusMeters: 300,
                radiusUnit: "km",
                selectedPresetIds: [],
            },
        });
        const mini = minifyEnvelope(envelope);
        const json = JSON.parse(canonicalize(mini));

        expect(
            json[FIELD_MAP.payload][FIELD_MAP.hidingZones][
                FIELD_MAP.selectedPresetIds
            ],
        ).toEqual([]);
    });
});

describe("unminifyEnvelope", () => {
    it("reconstructs omitted fields with defaults", () => {
        const envelope = makeEnvelope();
        const mini = minifyEnvelope(envelope);
        const restored = unminifyEnvelope(mini);

        expect(restored.payload.hidingZones?.radiusUnit).toBe("m");
        expect(restored.payload.metadata.updatedAt).toBe(
            restored.payload.metadata.createdAt,
        );
        expect(restored.payload.playArea?.osmType).toBe("R");
        expect(restored.payload.playArea?.bbox).toEqual([0, 0, 0, 0]);
        expect(restored.payload.playArea?.boundary).toBeUndefined();
    });

    it("uncompacts center back to float coordinates", () => {
        const envelope = makeEnvelope();
        const mini = minifyEnvelope(envelope);
        const restored = unminifyEnvelope(mini);

        const center = restored.payload.playArea!.center;
        expect(center[0]).toBeCloseTo(139.7, 4);
        expect(center[1]).toBeCloseTo(35.7, 4);
    });
});

describe("minify → unminify round-trip", () => {
    it("preserves full envelope fields through wire format", () => {
        const envelope = makeEnvelope();
        const restored = unminifyEnvelope(minifyEnvelope(envelope));

        expect(restored.kind).toBe(envelope.kind);
        expect(restored.version).toBe(envelope.version);
        expect(restored.payload.gameId).toBe(envelope.payload.gameId);
        expect(restored.payload.hidingZones?.radiusMeters).toBe(
            envelope.payload.hidingZones!.radiusMeters,
        );
        expect(restored.payload.hidingZones?.selectedPresetIds).toEqual(
            envelope.payload.hidingZones!.selectedPresetIds,
        );
        expect(restored.payload.metadata.createdAt).toBe(
            envelope.payload.metadata.createdAt,
        );
        expect(restored.payload.playArea?.center[0]).toBeCloseTo(
            envelope.payload.playArea!.center[0],
            4,
        );
        expect(restored.payload.playArea?.center[1]).toBeCloseTo(
            envelope.payload.playArea!.center[1],
            4,
        );
        expect(restored.payload.playArea?.label).toBe(
            envelope.payload.playArea!.label,
        );
        expect(restored.payload.playArea?.osmId).toBe(
            envelope.payload.playArea!.osmId,
        );
    });

    it("handles envelope without hidingZones", () => {
        const envelope = makeEnvelope({ hidingZones: undefined });
        const restored = unminifyEnvelope(minifyEnvelope(envelope));

        expect(restored.payload.hidingZones).toBeUndefined();
    });

    it("handles envelope without playArea", () => {
        const envelope = makeEnvelope({ playArea: undefined });
        const restored = unminifyEnvelope(minifyEnvelope(envelope));

        expect(restored.payload.playArea).toBeUndefined();
    });

    it("minified JSON is measurably smaller than full JSON", () => {
        const envelope = makeEnvelope();
        const fullJson = canonicalize(envelope);
        const miniJson = canonicalize(minifyEnvelope(envelope));

        expect(miniJson.length).toBeLessThan(fullJson.length);

        const diff = fullJson.length - miniJson.length;
        expect(diff).toBeGreaterThan(0);
    });

    it("center precision is preserved within 1e-5 degrees", () => {
        const envelope = makeEnvelope();
        const restored = unminifyEnvelope(minifyEnvelope(envelope));

        const origCenter = envelope.payload.playArea!.center;
        const restoredCenter = restored.payload.playArea!.center;
        expect(Math.abs(restoredCenter[0] - origCenter[0])).toBeLessThan(1e-5);
        expect(Math.abs(restoredCenter[1] - origCenter[1])).toBeLessThan(1e-5);
    });

    it("round-trips envelope with zero coordinates", () => {
        const envelope = makeEnvelope({
            playArea: {
                bbox: [0, 0, 0, 0],
                boundary: { features: [], type: "FeatureCollection" },
                center: [0, 0],
                label: "Null Island",
                osmId: 0,
                osmType: "R",
            },
        });
        const restored = unminifyEnvelope(minifyEnvelope(envelope));

        expect(restored.payload.playArea?.center).toEqual([0, 0]);
        expect(restored.payload.playArea?.label).toBe("Null Island");
    });

    it("round-trips negative coordinates", () => {
        const envelope = makeEnvelope({
            playArea: {
                bbox: [-75, -35, -70, -30],
                boundary: { features: [], type: "FeatureCollection" },
                center: [-73, -33],
                label: "South Atlantic",
                osmId: 3,
                osmType: "R",
            },
        });
        const restored = unminifyEnvelope(minifyEnvelope(envelope));

        expect(restored.payload.playArea?.center[0]).toBeCloseTo(-73, 4);
        expect(restored.payload.playArea?.center[1]).toBeCloseTo(-33, 4);
    });
});
