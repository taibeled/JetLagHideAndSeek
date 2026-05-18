import circle from "@turf/circle";

import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import type { Position } from "@/features/map/geojsonTypes";

import type {
    NearestStationInfo,
    RadiusQuestionFeatureCollection,
    QuestionState,
} from "./questionTypes";

const EARTH_RADIUS_METERS = 6371008.8;
const METERS_PER_MILE = 1609.344;

export function buildRadiusQuestionFeatureCollection(
    questions: QuestionState[],
): RadiusQuestionFeatureCollection {
    return {
        features: questions.map((question) =>
            circle(question.center, question.radiusMeters / 1000, {
                properties: {
                    id: question.id,
                    radiusMeters: question.radiusMeters,
                },
                steps: 64,
                units: "kilometers",
            }),
        ),
        type: "FeatureCollection",
    };
}

export function findNearestStation(
    center: Position,
    stations: TransitStation[],
): NearestStationInfo {
    if (stations.length === 0) return null;

    let nearest: NearestStationInfo = null;
    for (const station of stations) {
        const distanceMeters = getDistanceMeters(center, [
            station.lon,
            station.lat,
        ]);
        if (!nearest || distanceMeters < nearest.distanceMeters) {
            nearest = { distanceMeters, station };
        }
    }
    return nearest;
}

export function formatStationDistance(distanceMeters: number): string {
    if (distanceMeters < 1000) return `${Math.round(distanceMeters)} meters`;
    return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function toMeters(value: string, unit: "m" | "km" | "mi") {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
    if (unit === "km") return numericValue * 1000;
    if (unit === "mi") return numericValue * METERS_PER_MILE;
    return numericValue;
}

export function fromMeters(meters: number, unit: "m" | "km" | "mi") {
    const value =
        unit === "km"
            ? meters / 1000
            : unit === "mi"
              ? meters / METERS_PER_MILE
              : meters;
    if (Math.abs(value - Math.round(value)) < 0.000001) {
        return String(Math.round(value));
    }
    if (value >= 10) return value.toFixed(1);
    return value.toFixed(2);
}

function getDistanceMeters(a: Position, b: Position): number {
    const [lonA, latA] = a;
    const [lonB, latB] = b;
    const phiA = toRadians(latA);
    const phiB = toRadians(latB);
    const deltaPhi = toRadians(latB - latA);
    const deltaLambda = toRadians(lonB - lonA);
    const haversine =
        Math.sin(deltaPhi / 2) ** 2 +
        Math.cos(phiA) * Math.cos(phiB) * Math.sin(deltaLambda / 2) ** 2;
    return (
        2 *
        EARTH_RADIUS_METERS *
        Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

function toRadians(value: number): number {
    return (value * Math.PI) / 180;
}
