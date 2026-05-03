import { afterEach, describe, expect, it } from "vitest";

import {
    customPresets,
    defaultUnit,
    displayHidingZones,
    displayHidingZoneOperators,
    displayHidingZonesOptions,
    displayHidingZonesStyle,
    hidingRadius,
    hidingRadiusUnits,
    hidingZone,
    mapGeoLocation,
    polyGeoJSON,
    questions,
    saveCustomPreset,
    team,
} from "@/lib/context";
import {
    applyHidingZoneGeojson,
    applyWireV1Payload,
    loadHidingZoneFromJsonString,
} from "@/lib/loadHidingZone";
import {
    buildWireV1Envelope,
    stripWireEnvelope,
    wireV1SnapshotSchema,
} from "@/lib/wire";
import type { Questions } from "@/maps/schema";

const basePayload = {
    type: "Feature",
    geometry: {
        type: "Point",
        coordinates: [139.2394179, 36.5748441],
    },
    properties: {
        osm_type: "R",
        osm_id: 382313,
        osm_key: "place",
        countrycode: "JP",
        osm_value: "country",
        name: "Japan",
        type: "country",
        isHidingZone: true,
        questions: [],
    },
};

afterEach(() => {
    defaultUnit.set("miles");
    hidingRadius.set(0.5);
    hidingRadiusUnits.set("miles");
    displayHidingZonesStyle.set("zones");
});

describe("CAS game state settings", () => {
    it("includes unit and hiding-zone display settings in the wire payload", () => {
        defaultUnit.set("kilometers");
        hidingRadius.set(1.25);
        hidingRadiusUnits.set("meters");
        displayHidingZonesStyle.set("no-overlap");

        const wire = buildWireV1Envelope(hidingZone.get());

        expect(wire).toMatchObject({
            defaultUnit: "kilometers",
            hidingRadius: 1.25,
            hidingRadiusUnits: "meters",
            displayHidingZonesStyle: "no-overlap",
        });
    });

    it("restores shared unit and hiding-zone display settings from CAS", () => {
        defaultUnit.set("miles");
        hidingRadius.set(0.5);
        hidingRadiusUnits.set("miles");
        displayHidingZonesStyle.set("zones");

        applyWireV1Payload(
            JSON.stringify({
                v: 1,
                ...basePayload,
                defaultUnit: "kilometers",
                hidingRadius: 2.75,
                hidingRadiusUnits: "meters",
                displayHidingZonesStyle: "no-overlap",
            }),
        );

        expect(defaultUnit.get()).toBe("kilometers");
        expect(hidingRadius.get()).toBe(2.75);
        expect(hidingRadiusUnits.get()).toBe("meters");
        expect(displayHidingZonesStyle.get()).toBe("no-overlap");
    });

    it("leaves local settings intact for legacy payloads without the new keys", () => {
        defaultUnit.set("kilometers");
        hidingRadius.set(1.5);
        hidingRadiusUnits.set("meters");
        displayHidingZonesStyle.set("no-display");

        applyWireV1Payload(JSON.stringify({ v: 1, ...basePayload }));

        expect(defaultUnit.get()).toBe("kilometers");
        expect(hidingRadius.get()).toBe(1.5);
        expect(hidingRadiusUnits.get()).toBe("meters");
        expect(displayHidingZonesStyle.get()).toBe("no-display");
    });

    it("ignores invalid shared setting values", () => {
        defaultUnit.set("kilometers");
        hidingRadius.set(1.5);
        hidingRadiusUnits.set("meters");
        displayHidingZonesStyle.set("no-display");

        applyHidingZoneGeojson({
            ...basePayload,
            defaultUnit: "yards",
            hidingRadius: Number.POSITIVE_INFINITY,
            hidingRadiusUnits: "feet",
            displayHidingZonesStyle: "everything",
        });

        expect(defaultUnit.get()).toBe("kilometers");
        expect(hidingRadius.get()).toBe(1.5);
        expect(hidingRadiusUnits.get()).toBe("meters");
        expect(displayHidingZonesStyle.get()).toBe("no-display");
    });
});

describe("state hydration edge cases", () => {
    it("loadHidingZoneFromJsonString with legacy (non-v1) payload still works", () => {
        loadHidingZoneFromJsonString(
            JSON.stringify({
                type: "Feature",
                geometry: { type: "Point", coordinates: [139, 35] },
                properties: {
                    isHidingZone: true,
                    questions: [
                        {
                            id: "radius",
                            key: 0,
                            data: {
                                lat: 35,
                                lng: 139,
                                radius: 100,
                                unit: "meters",
                                within: true,
                                drag: true,
                                color: "blue",
                                collapsed: false,
                            },
                        },
                    ],
                },
            }),
        );
        expect(questions.get().length).toBeGreaterThan(0);
    });

    it("applyHidingZoneGeojson with properties.questions populates questions store", () => {
        applyHidingZoneGeojson({
            type: "Feature",
            geometry: { type: "Point", coordinates: [139, 35] },
            properties: {
                isHidingZone: true,
                questions: [
                    {
                        id: "radius",
                        key: 0,
                        data: {
                            lat: 35,
                            lng: 139,
                            radius: 100,
                            unit: "meters",
                            within: true,
                            drag: true,
                            color: "blue",
                            collapsed: false,
                        },
                    },
                ],
            },
        });
        expect(questions.get().length).toBe(1);
    });

    it("displayHidingZones auto-enables for detecting-zone mode", () => {
        displayHidingZones.set(false);
        applyHidingZoneGeojson({
            type: "Feature",
            geometry: { type: "Point", coordinates: [139, 35] },
            properties: {
                isHidingZone: true,
                questions: [],
            },
            zoneOptions: ["[railway=station]"],
        });
        expect(displayHidingZones.get()).toBe(true);
    });

    it("preset import generates fallback ID when preset has no name or id", () => {
        customPresets.set([]);
        applyHidingZoneGeojson({
            type: "Feature",
            geometry: { type: "Point", coordinates: [139, 35] },
            properties: {
                isHidingZone: true,
                questions: [],
            },
            presets: [{ type: "custom", data: { x: 1 } }],
        });
        const presets = customPresets.get();
        expect(presets.length).toBe(1);
        expect(presets[0]!.id).toBeTruthy();
        expect(presets[0]!.name).toBe("Imported preset");
    });

    it("stripWireEnvelope extracts team from snapshot correctly", () => {
        const snap = wireV1SnapshotSchema.parse({
            v: 1,
            team: {
                id: "abcdabcdabcdabcdabcdabcdabcdabcd",
                name: "TestTeam",
            },
            type: "Feature",
            geometry: { type: "Point", coordinates: [139, 35] },
            properties: {},
        });
        const { team: t } = stripWireEnvelope(snap);
        expect(t).toEqual({
            id: "abcdabcdabcdabcdabcdabcdabcdabcd",
            name: "TestTeam",
        });
    });

    it("stripWireEnvelope returns null team when snapshot has no team", () => {
        const snap = wireV1SnapshotSchema.parse({
            v: 1,
            type: "Feature",
            geometry: { type: "Point", coordinates: [139, 35] },
            properties: {},
        });
        const { team: t } = stripWireEnvelope(snap);
        expect(t).toBeNull();
    });
});

describe("wire/CAS full round-trip", () => {
    it("buildWireV1Envelope + wire roundtrip preserves questions", () => {
        applyHidingZoneGeojson(basePayload);
        const q = [
            {
                id: "radius",
                key: 1,
                data: {
                    lat: 35,
                    lng: 139,
                    radius: 100,
                    unit: "meters",
                    within: true,
                    drag: false,
                    color: "blue",
                    collapsed: false,
                },
            },
        ] satisfies Questions;
        questions.set(q);

        const wire = buildWireV1Envelope(hidingZone.get());
        questions.set([]);
        applyWireV1Payload(JSON.stringify(wire));

        const restored = questions.get();
        expect(restored.length).toBe(1);
        const restoredQuestion = restored[0]!;
        expect(restoredQuestion.id).toBe("radius");
        if (restoredQuestion.id !== "radius") {
            throw new Error("Expected radius question");
        }
        expect(restoredQuestion.data.lat).toBe(35);
    });

    it("roundtrip preserves selectedTrainLineId through wire", () => {
        applyHidingZoneGeojson(basePayload);
        const q = [
            {
                id: "matching",
                key: 1,
                data: {
                    type: "same-train-line" as const,
                    same: true,
                    lat: 35,
                    lng: 139,
                    drag: false,
                    color: "blue",
                    collapsed: false,
                    selectedTrainLineId: "way/456",
                    selectedTrainLineLabel: "Yamanote Line",
                },
            },
        ] satisfies Questions;
        questions.set(q);

        const wire = buildWireV1Envelope(hidingZone.get());
        questions.set([]);
        applyWireV1Payload(JSON.stringify(wire));

        const restored = questions.get();
        expect(restored.length).toBe(1);
        const restoredQuestion = restored[0]!;
        expect(restoredQuestion.id).toBe("matching");
        if (restoredQuestion.id !== "matching") {
            throw new Error("Expected matching question");
        }
        if (restoredQuestion.data.type !== "same-train-line") {
            throw new Error("Expected same-train-line question");
        }
        expect(restoredQuestion.data.selectedTrainLineId).toBe("way/456");
        expect(restoredQuestion.data.selectedTrainLineLabel).toBe("Yamanote Line");
    });

    it("roundtrip preserves custom presets", () => {
        customPresets.set([]);
        applyHidingZoneGeojson(basePayload);
        saveCustomPreset({ name: "RoundtripTest", type: "custom", data: { x: 1 } });

        const wire = buildWireV1Envelope(hidingZone.get());
        customPresets.set([]);
        applyWireV1Payload(JSON.stringify(wire));

        expect(customPresets.get().some((p) => p.name === "RoundtripTest")).toBe(
            true,
        );
    });

    it("applyHidingZoneGeojson with isHidingZone flag processes questions", () => {
        applyHidingZoneGeojson({
            type: "Feature",
            geometry: { type: "Point", coordinates: [139, 35] },
            properties: {
                isHidingZone: true,
                questions: [
                    {
                        id: "tentacles",
                        key: 1,
                        data: {
                            lat: 35,
                            lng: 139,
                            drag: true,
                            color: "blue",
                            collapsed: false,
                            radius: 15,
                            unit: "miles",
                            locationType: "museum",
                        },
                    },
                ],
            },
        });

        const qs = questions.get();
        expect(qs.length).toBe(1);

        const wire = buildWireV1Envelope(hidingZone.get());
        questions.set([]);
        applyWireV1Payload(JSON.stringify(wire));

        expect(questions.get().length).toBe(1);
    });
});
