import { buildHidingZoneFeatureCollection } from "@/features/hidingZone/hidingZone";
import type { TransitStation } from "@/features/hidingZone/hidingZoneTypes";
import type { Position } from "@/shared/geojson";
import type { QuestionAnswer } from "@/features/questions/coreTypes";
import { findNearestStation } from "@/features/questions/radar/radarGeometry";
import type { NearestStationInfo } from "@/features/questions/radar/radarTypes";
import type { TransitLineQuestionFeatureCollection } from "@/features/questions/transitLine/transitLineTypes";
import type { TransitLineQuestion } from "@/features/questions/transitLine/transitLineTypes";

export type TransitLineOption = {
    closestStation: NearestStationInfo;
    distanceMeters: number | null;
    id: string;
    name: string;
    stationCount: number;
};

export function reconcileTransitLineQuestionSelection(
    question: TransitLineQuestion,
    lineOptions: TransitLineOption[],
    updatedAt = new Date().toISOString(),
): TransitLineQuestion {
    if (lineOptions.some((option) => option.id === question.lineId)) {
        return question;
    }

    const soleOption = lineOptions.length === 1 ? lineOptions[0] : null;
    const nextAnswer: QuestionAnswer = soleOption
        ? question.answer
        : "unanswered";
    const nextLineId = soleOption?.id ?? null;
    const nextLineName = soleOption?.name ?? null;

    if (
        question.answer === nextAnswer &&
        question.lineId === nextLineId &&
        question.lineName === nextLineName
    ) {
        return question;
    }

    return {
        ...question,
        answer: nextAnswer,
        lineId: nextLineId,
        lineName: nextLineName,
        updatedAt,
    };
}

export function getTransitLineOptions(
    stations: TransitStation[],
    routeNamesById: Map<string, string>,
    center: Position,
    maxDistanceMeters: number,
): TransitLineOption[] {
    const stationsById = new Map<string, TransitStation[]>();
    stations.forEach((station) => {
        station.routeIds.forEach((routeId) => {
            const routeStations = stationsById.get(routeId) ?? [];
            routeStations.push(station);
            stationsById.set(routeId, routeStations);
        });
    });

    return [...stationsById.entries()]
        .map(([id, routeStations]) => {
            const closestStation = findNearestStation(center, routeStations);
            return {
                closestStation,
                distanceMeters: closestStation?.distanceMeters ?? null,
                id,
                name: routeNamesById.get(id) ?? id,
                stationCount: routeStations.length,
            };
        })
        .filter(
            (option) =>
                option.distanceMeters !== null &&
                option.distanceMeters <= maxDistanceMeters,
        )
        .sort((a, b) => {
            if (a.distanceMeters === null && b.distanceMeters === null) {
                return a.name.localeCompare(b.name);
            }
            if (a.distanceMeters === null) return 1;
            if (b.distanceMeters === null) return -1;
            return (
                a.distanceMeters - b.distanceMeters ||
                a.name.localeCompare(b.name)
            );
        });
}

export function buildTransitLineMaskFeatures(
    stations: TransitStation[],
    lineId: string | null,
    radiusMeters: number,
): TransitLineQuestionFeatureCollection {
    if (!lineId) return { type: "FeatureCollection", features: [] };

    const lineStations = stations.filter((station) =>
        station.routeIds.includes(lineId),
    );

    return buildHidingZoneFeatureCollection(
        lineStations,
        radiusMeters,
    ) as unknown as TransitLineQuestionFeatureCollection;
}
