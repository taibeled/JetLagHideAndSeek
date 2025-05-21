import type { Question } from "./schema";
import type { Feature, FeatureCollection } from "geojson";
import {
    adjustPerRadius,
    hiderifyRadius,
    radiusPlanningPolygon,
} from "./radius";
import {
    adjustPerThermometer,
    hiderifyThermometer,
    thermometerPlanningPolygon,
} from "./thermometer";
import {
    adjustPerTentacle,
    hiderifyTentacles,
    tentaclesPlanningPolygon,
} from "./tentacles";
import {
    adjustPerMatching,
    hiderifyMatching,
    matchingPlanningPolygon,
} from "./matching";
import {
    adjustPerMeasuring,
    hiderifyMeasuring,
    measuringPlanningPolygon,
} from "./measuring";

export * from "./radius";
export * from "./thermometer";
export * from "./tentacles";
export * from "./matching";
export * from "./measuring";
export * from "./geo-utils";

export const hiderifyQuestion = async (question: Question) => {
    switch (question.id) {
        case "radius":
            question.data = hiderifyRadius(question.data);
            break;
        case "thermometer":
            question.data = hiderifyThermometer(question.data);
            break;
        case "tentacles":
            question.data = await hiderifyTentacles(question.data);
            break;
        case "matching":
            question.data = await hiderifyMatching(question.data);
            break;
        case "measuring":
            question.data = await hiderifyMeasuring(question.data);
            break;
    }

    return question;
};

export const determinePlanningPolygon = async (
    question: Question,
    planningModeEnabled: boolean,
) => {
    if (planningModeEnabled && question.data.drag) {
        switch (question.id) {
            case "radius":
                return radiusPlanningPolygon(question.data);
            case "thermometer":
                return thermometerPlanningPolygon(question.data);
            case "tentacles":
                return tentaclesPlanningPolygon(question.data);
            case "matching":
                return matchingPlanningPolygon(question.data);
            case "measuring":
                return measuringPlanningPolygon(question.data);
        }
    }
};

export async function adjustMapGeoDataForQuestion(
    question: any,
    mapGeoData: any,
    masked: boolean,
) {
    try {
        switch (question?.id) {
            case "radius":
                if (masked && !question.data.within) {
                    return adjustPerRadius(question.data, mapGeoData, true);
                }
                if (!masked && question.data.within) {
                    return adjustPerRadius(question.data, mapGeoData, false);
                }
                return mapGeoData;
            case "tentacles":
                if (masked && question.data.location === false) {
                    return adjustPerRadius(
                        { ...question.data, within: false },
                        mapGeoData,
                        true,
                    );
                }
                if (!masked && question.data.location !== false) {
                    return await adjustPerTentacle(
                        question.data,
                        mapGeoData,
                        false,
                    );
                }
                return mapGeoData;
            case "thermometer":
                if (!masked) {
                    return adjustPerThermometer(
                        question.data,
                        mapGeoData,
                        false,
                    );
                }
                return mapGeoData;
            case "matching":
                return await adjustPerMatching(
                    question.data,
                    mapGeoData,
                    masked,
                );
            case "measuring":
                return await adjustPerMeasuring(
                    question.data,
                    mapGeoData,
                    masked,
                );
            default:
                return mapGeoData;
        }
    } catch {
        return mapGeoData;
    }
}

export async function applyQuestionsToMapGeoData(
    questions: any[],
    mapGeoData: any,
    masked: boolean,
    planningModeEnabled: boolean,
    planningModeCallback?: (
        polygon: FeatureCollection | Feature,
        question: any,
    ) => void,
): Promise<any> {
    for (const question of questions) {
        if (planningModeCallback) {
            const planningPolygon = await determinePlanningPolygon(
                question,
                planningModeEnabled,
            );
            if (planningPolygon) {
                planningModeCallback(planningPolygon, question);
            }
        }

        if (planningModeEnabled && question.data.drag) {
            continue;
        }

        mapGeoData = await adjustMapGeoDataForQuestion(
            question,
            mapGeoData,
            masked,
        );
        if (mapGeoData.type !== "FeatureCollection") {
            mapGeoData = {
                type: "FeatureCollection",
                features: [mapGeoData],
            };
        }
    }
    return mapGeoData;
}
