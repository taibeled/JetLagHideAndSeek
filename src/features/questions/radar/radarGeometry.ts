import circle from "@turf/circle";

import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import { type Position, haversineDistanceMeters } from "@/shared/geojson";
import type { QuestionState } from "@/features/questions/questionTypes";
export { fromMeters, toMeters } from "@/shared/distanceUnits";

import type {
    NearestStationInfo,
    RadarQuestion,
    RadarQuestionFeatureCollection,
    RadarQuestionRenderState,
} from "./radarTypes";

export function buildRadarQuestionRenderState(
    questions: QuestionState[],
): RadarQuestionRenderState {
    const radarQuestions = questions.filter(
        (question): question is RadarQuestion => question.type === "radar",
    );

    return {
        hitMaskFeatures: buildRadarQuestionFeatureCollection(
            radarQuestions.filter((question) => question.answer === "positive"),
        ),
        missMaskFeatures: buildRadarQuestionFeatureCollection(
            radarQuestions.filter((question) => question.answer === "negative"),
        ),
        outlineFeatures: buildRadarQuestionFeatureCollection(radarQuestions),
        previewFeatures: buildRadarQuestionFeatureCollection(
            radarQuestions.filter(
                (question) => question.answer === "unanswered",
            ),
        ),
    };
}

export function buildRadarQuestionFeatureCollection(
    questions: RadarQuestion[],
): RadarQuestionFeatureCollection {
    return {
        features: questions.map((question) =>
            circle(question.center, question.distanceMeters / 1000, {
                properties: {
                    answer: question.answer,
                    distanceMeters: question.distanceMeters,
                    id: question.id,
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

function getDistanceMeters(a: Position, b: Position): number {
    const [lonA, latA] = a;
    const [lonB, latB] = b;
    return haversineDistanceMeters(latA, lonA, latB, lonB);
}
