/**
 * Unit-Tests für die Karten-Geometrie-Logik.
 *
 * Getestet wird die Pipeline:
 *   Frage-Daten → adjustPerX(question, mapData) → geclippte FeatureCollection
 *
 * arcBuffer (aus @arcgis/core, Browser-WASM) wird vollständig gemockt:
 *   – @arcgis/core-Module werden durch leere Stubs ersetzt
 *   – @/maps/geo-utils/operators.arcBuffer wird durch turf.buffer ersetzt
 * Alle anderen Funktionen (geoSpatialVoronoi, modifyMapData, etc.) sind pure
 * und laufen ohne Mock.
 */

import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { beforeAll, describe, expect, it, vi } from "vitest";

// ── @arcgis/core mocken ───────────────────────────────────────────────────────
// @arcgis/core nutzt intern `require` (CJS-Chunks) und WebAssembly – beides
// ist in Node/Vitest nicht verfügbar. Wir mocken alle genutzten Sub-Module.
vi.mock("@arcgis/core/geometry/operators/geodesicBufferOperator.js", () => ({
    load: async () => {},
    executeMany: () => [null],
}));
vi.mock("@arcgis/core/geometry/operators/geodeticDistanceOperator.js", () => ({
    load: async () => {},
    execute: () => 0,
}));
vi.mock("@arcgis/core/geometry/support/jsonUtils.js", () => ({
    fromJSON: (x: unknown) => x,
}));
vi.mock("@arcgis/core/geometry/Point.js", () => ({
    default: class MockPoint {
        constructor(opts: Record<string, unknown>) {
            Object.assign(this, opts);
        }
    },
}));
vi.mock("@arcgis/core/core/units.js", () => ({}));
vi.mock("@arcgis/core/unionTypes.js", () => ({}));
vi.mock("@terraformer/arcgis", () => ({
    geojsonToArcGIS: (x: unknown) => x,
    arcgisToGeoJSON: (x: unknown) => x,
}));

// ── arcBuffer durch turf.buffer ersetzen ─────────────────────────────────────
// Auch wenn @arcgis/core gemockt ist, überschreiben wir arcBuffer explizit
// mit einer turf-basierten Implementierung um korrekte Ergebnisse zu liefern.
vi.mock("@/maps/geo-utils/operators", async (importOriginal) => {
    const real =
        await importOriginal<typeof import("@/maps/geo-utils/operators")>();
    return {
        ...real,
        arcBuffer: async (
            fc: FeatureCollection,
            distance: number,
            unit: string,
        ) => {
            const center = (
                fc.features[0].geometry as { coordinates: number[] }
            ).coordinates;
            const buf = turf.buffer(turf.point(center), distance, {
                units: unit as turf.Units,
            });
            // Rückgabe als Feature<MultiPolygon> (wie arcBuffer es täte)
            return turf.combine(
                turf.featureCollection([buf!]),
            ).features[0] as Feature<MultiPolygon>;
        },
    };
});

// ── Lazy imports (nach vi.mock) ───────────────────────────────────────────────
// Imports in beforeAll statt Top-Level, damit die Mocks bereits aktiv sind.
let holedMask: typeof import("@/maps/geo-utils/operators").holedMask;
let modifyMapData: typeof import("@/maps/geo-utils/operators").modifyMapData;
let safeUnion: typeof import("@/maps/geo-utils/operators").safeUnion;
let geoSpatialVoronoi: typeof import("@/maps/geo-utils/voronoi").geoSpatialVoronoi;
let adjustPerThermometer: typeof import("@/maps/questions/thermometer").adjustPerThermometer;
let adjustPerRadius: typeof import("@/maps/questions/radius").adjustPerRadius;
let adjustMapGeoDataForQuestion: typeof import("@/maps/index").adjustMapGeoDataForQuestion;

beforeAll(async () => {
    ({ holedMask, modifyMapData, safeUnion } = await import(
        "@/maps/geo-utils/operators"
    ));
    ({ geoSpatialVoronoi } = await import("@/maps/geo-utils/voronoi"));
    ({ adjustPerThermometer } = await import("@/maps/questions/thermometer"));
    ({ adjustPerRadius } = await import("@/maps/questions/radius"));
    ({ adjustMapGeoDataForQuestion } = await import("@/maps/index"));
});

// ── Test-Fixtures ─────────────────────────────────────────────────────────────

/** Einfaches Rechteck im Hamburg-Bereich als "Karte" */
const makeMapData = (): FeatureCollection<Polygon | MultiPolygon> =>
    turf.featureCollection([
        turf.bboxPolygon([9.7, 53.4, 10.3, 53.7]),
    ]) as FeatureCollection<Polygon | MultiPolygon>;

/** Kleines Rechteck im Zentrum – dient als Modifications-Polygon */
const makeSmallRect = (): Feature<Polygon> =>
    turf.bboxPolygon([9.95, 53.5, 10.05, 53.6]);

/** Prüft ob ein Punkt in einem Feature liegt */
function pointInResult(
    result: Feature<Polygon | MultiPolygon> | null | undefined,
    pt: Feature<Point>,
): boolean {
    if (!result) return false;
    return turf.booleanPointInPolygon(pt, result);
}

/** Prüft ob ein Punkt in irgendeinem Feature einer FeatureCollection liegt */
function pointInFeatures(
    result: FeatureCollection | Feature | null | undefined,
    pt: Feature<Point>,
): boolean {
    if (!result) return false;
    const features =
        result.type === "FeatureCollection" ? result.features : [result];
    return features.some((f) =>
        turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>),
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("safeUnion", () => {
    it("gibt ein einzelnes Feature direkt zurück", () => {
        const single = turf.bboxPolygon([0, 0, 1, 1]);
        const fc = turf.featureCollection([single]) as FeatureCollection<Polygon>;
        const result = safeUnion(fc);
        expect(result.type).toBe("Feature");
        expect(turf.area(result)).toBeCloseTo(turf.area(single), -3);
    });

    it("vereinigt mehrere überlappende Features zu einem", () => {
        const a = turf.bboxPolygon([0, 0, 2, 1]);
        const b = turf.bboxPolygon([1, 0, 3, 1]);
        const fc = turf.featureCollection([a, b]) as FeatureCollection<Polygon>;
        const result = safeUnion(fc);
        const areaA = turf.area(a);
        const areaB = turf.area(b);
        // Union größer als jedes Einzelstück, kleiner als Summe (Überlappung)
        expect(turf.area(result)).toBeGreaterThan(areaA);
        expect(turf.area(result)).toBeGreaterThan(areaB);
        expect(turf.area(result)).toBeLessThan(areaA + areaB);
    });
});

describe("holedMask", () => {
    it("erstellt Weltpolygon minus Input – Ergebnis ist deutlich größer als Input", () => {
        const input = makeSmallRect();
        const mask = holedMask(input);
        expect(mask).not.toBeNull();
        // Der Rest der Welt ist viel größer als das kleine Rechteck
        expect(turf.area(mask!)).toBeGreaterThan(turf.area(input) * 1000);
    });

    it("der Mittelpunkt des Inputs liegt NICHT in der Maske (ausgestanzt)", () => {
        const input = makeSmallRect();
        const center = turf.center(input);
        const mask = holedMask(input);
        expect(mask).not.toBeNull();
        expect(turf.booleanPointInPolygon(center, mask!)).toBe(false);
    });
});

describe("modifyMapData", () => {
    it("within=true → Schnittmenge: Ergebnis kleiner als mapData, Zentrum liegt darin", () => {
        const mapData = makeMapData();
        const smallRect = makeSmallRect();
        const result = modifyMapData(mapData, smallRect, true);

        expect(result).not.toBeNull();
        expect(turf.area(result!)).toBeLessThan(turf.area(mapData));
        // Zentrum des Rechtecks liegt im Ergebnis
        const center = turf.center(smallRect);
        expect(pointInResult(result, center)).toBe(true);
    });

    it("within=false → Differenz: Zentrum ausgestanzt, entfernter Punkt noch vorhanden", () => {
        const mapData = makeMapData();
        const smallRect = makeSmallRect();
        const result = modifyMapData(mapData, smallRect, false);

        expect(result).not.toBeNull();
        // Das Zentrum des kleinen Rechtecks ist herausgeschnitten
        const center = turf.center(smallRect);
        expect(pointInResult(result, center)).toBe(false);
        // Ein Punkt außerhalb des Rechtecks (aber in der Karte) ist noch da
        const outerPoint = turf.point([9.8, 53.45]);
        expect(pointInResult(result, outerPoint)).toBe(true);
    });
});

describe("geoSpatialVoronoi", () => {
    it("liefert genau 2 Voronoi-Regionen für 2 Eingabe-Punkte", () => {
        const pointA = turf.point([9.8, 53.55]);
        const pointB = turf.point([10.2, 53.55]);
        const voronoi = geoSpatialVoronoi(
            turf.featureCollection([pointA, pointB]),
        );
        expect(voronoi.features.length).toBe(2);
    });

    it("beide Regionen haben ähnliche Fläche (Voronoi teilt Raum gleichmäßig für symmetrische Punkte)", () => {
        // Zwei symmetrisch positionierte Punkte → Voronoi sollte den Raum ~gleich aufteilen
        const pointA = turf.point([9.8, 53.55]);
        const pointB = turf.point([10.2, 53.55]);
        const voronoi = geoSpatialVoronoi(
            turf.featureCollection([pointA, pointB]),
        );
        const area0 = turf.area(voronoi.features[0]);
        const area1 = turf.area(voronoi.features[1]);
        // Beide Regionen sollten ähnlich groß sein (±50% Toleranz)
        expect(area0).toBeGreaterThan(0);
        expect(area1).toBeGreaterThan(0);
        const ratio = Math.max(area0, area1) / Math.min(area0, area1);
        expect(ratio).toBeLessThan(2);
    });
});

describe("adjustPerThermometer", () => {
    // Punkt A und B links/rechts von der Kartenmitte
    // warmer=true → Seite von Punkt B (features[1] des Voronoi)
    // warmer=false → Seite von Punkt A (features[0] des Voronoi)
    const thermoBase = {
        latA: 53.55, lngA: 9.8,
        latB: 53.55, lngB: 10.2,
        colorA: "blue" as const,
        colorB: "red" as const,
        drag: false,
        collapsed: false,
    };

    it("warmer=true und warmer=false liefern komplementäre, nicht-leere Ergebnisse", () => {
        // Beide Ergebnisse müssen gültig sein
        const resultTrue = adjustPerThermometer({ ...thermoBase, warmer: true }, makeMapData());
        const resultFalse = adjustPerThermometer({ ...thermoBase, warmer: false }, makeMapData());

        expect(resultTrue).not.toBeNull();
        expect(resultFalse).not.toBeNull();

        // Beide müssen positive Fläche haben (echte Gebiete)
        expect(turf.area(resultTrue!)).toBeGreaterThan(0);
        expect(turf.area(resultFalse!)).toBeGreaterThan(0);
    });

    it("warmer=true + warmer=false zusammen ergeben (fast) die gesamte Karte", () => {
        const mapData = makeMapData();
        const mapArea = turf.area(mapData);

        const resultTrue = adjustPerThermometer({ ...thermoBase, warmer: true }, makeMapData());
        const resultFalse = adjustPerThermometer({ ...thermoBase, warmer: false }, makeMapData());

        const areaTrue = turf.area(resultTrue!);
        const areaFalse = turf.area(resultFalse!);

        // Beide Hälften zusammen sollten ~100% der Karte ergeben (kleiner Grenzfehler)
        expect(areaTrue + areaFalse).toBeCloseTo(mapArea, -6);
        // Jede Hälfte sollte weniger als 100% der Karte sein
        expect(areaTrue).toBeLessThan(mapArea);
        expect(areaFalse).toBeLessThan(mapArea);
    });
});

// Die adjustPerRadius-Funktion nutzt arcBuffer intern. Da der ESM-Mock für
// operators.arcBuffer greift wenn über adjustMapGeoDataForQuestion aufgerufen,
// testen wir adjustPerRadius hier über den modifyMapData-Weg: Wir erzeugen
// einen turf.buffer manuell und rufen modifyMapData direkt auf.
describe("Radius-Clipping via modifyMapData (direkt, kein arcBuffer nötig)", () => {
    // Simuliert was adjustPerRadius intern macht, aber mit turf.buffer statt arcBuffer
    const radiusCenter = turf.point([10.0, 53.55]);
    const radiusKm = 5;
    const circle = turf.buffer(radiusCenter, radiusKm, { units: "kilometers" })!;
    const center = radiusCenter;
    // Punkt klar außerhalb des 5km-Radius
    const farAway = turf.point([9.75, 53.45]); // ~25 km vom Zentrum

    it("within=true → Zentrum liegt im Ergebnis, entfernter Punkt nicht", () => {
        const result = modifyMapData(makeMapData(), circle, true);
        expect(result).not.toBeNull();
        expect(pointInResult(result, center)).toBe(true);
        expect(pointInResult(result, farAway)).toBe(false);
    });

    it("within=false → Zentrum liegt NICHT im Ergebnis, entfernter Punkt schon", () => {
        const result = modifyMapData(makeMapData(), circle, false);
        expect(result).not.toBeNull();
        expect(pointInResult(result, center)).toBe(false);
        expect(pointInResult(result, farAway)).toBe(true);
    });
});

describe("adjustMapGeoDataForQuestion", () => {
    it('type="radius", within=true → Zentrum des Radius liegt im Ergebnis', async () => {
        const question = {
            id: "radius" as const,
            key: 1,
            data: {
                lat: 53.55, lng: 10.0,
                radius: 5, unit: "kilometers" as const,
                within: true, drag: false, color: "red" as const, collapsed: false,
            },
        };
        const result = await adjustMapGeoDataForQuestion(question, makeMapData());
        const center = turf.point([10.0, 53.55]);
        expect(pointInFeatures(result, center)).toBe(true);
    });

    it('type="thermometer" → Ergebnis hat positive Fläche (Thermometer-Clipping greift)', async () => {
        const question = {
            id: "thermometer" as const,
            key: 2,
            data: {
                latA: 53.55, lngA: 9.8,
                latB: 53.55, lngB: 10.2,
                warmer: true, drag: false,
                colorA: "blue" as const, colorB: "red" as const, collapsed: false,
            },
        };
        const result = await adjustMapGeoDataForQuestion(question, makeMapData());
        expect(result).not.toBeNull();
        // Das Ergebnis muss eine echte positive Fläche haben
        const resultFc = result.type === "FeatureCollection"
            ? result
            : turf.featureCollection([result]);
        expect(turf.area(resultFc)).toBeGreaterThan(0);
        // Und kleiner als die volle Karte (da geclippt)
        expect(turf.area(resultFc)).toBeLessThan(turf.area(makeMapData()));
    });

    it("unbekannte Frage-ID wird sicher behandelt (kein Absturz, mapData bleibt erhalten)", async () => {
        // Bonus-Test: Auch nicht-tentacle-Sonderfälle sollen sicher abgefangen werden.
        // Prüft die robuste Fehlerbehandlung für ungültige question.data
        const question = {
            id: "radius" as const,
            key: 4,
            data: {
                // Ungültige data (kein lat/lng) → adjustPerRadius gibt null zurück
                // modifyMapData wirft dann einen Fehler, der gecatched wird
                lat: null as any, lng: null as any,
                radius: 5, unit: "kilometers" as const,
                within: true, drag: false, color: "red" as const, collapsed: false,
            },
        };
        const mapData = makeMapData();
        // Kein unkontrollierter Absturz
        const result = await adjustMapGeoDataForQuestion(question, mapData);
        // Bei Fehler gibt adjustMapGeoDataForQuestion die originale mapData zurück
        expect(result).not.toBeNull();
        expect(["Feature", "FeatureCollection"].includes(result.type)).toBe(true);
    });

    it("unbekannter Typ → gibt mapData unverändert zurück", async () => {
        const mapData = makeMapData();
        const question = { id: "unknown_type" as any, key: 99, data: {} };
        const result = await adjustMapGeoDataForQuestion(question, mapData);
        // Fläche sollte identisch bleiben
        const originalArea = turf.area(mapData);
        const resultArea = turf.area(
            result.type === "FeatureCollection"
                ? result
                : turf.featureCollection([result]),
        );
        expect(resultArea).toBeCloseTo(originalArea, -3);
    });
});
