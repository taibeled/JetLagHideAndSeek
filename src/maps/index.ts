import type { Feature, FeatureCollection } from "geojson";

import {
    adjustPerMatching,
    hiderifyMatching,
    matchingPlanningPolygon,
} from "@/maps/questions/matching";
import {
    adjustPerMeasuring,
    hiderifyMeasuring,
    measuringPlanningPolygon,
} from "@/maps/questions/measuring";
import {
    adjustPerRadius,
    hiderifyRadius,
    radiusPlanningPolygon,
} from "@/maps/questions/radius";
import {
    adjustPerTentacle,
    hiderifyTentacles,
    tentaclesPlanningPolygon,
} from "@/maps/questions/tentacles";
import {
    adjustPerThermometer,
    hiderifyThermometer,
    thermometerPlanningPolygon,
} from "@/maps/questions/thermometer";
import type { Question, Questions } from "@/maps/schema";

export * from "@/maps/geo-utils";

export const hiderifyQuestion = async (question: Question) => {
    if (question.data.drag) {
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
    }

    return question;
};

const determinePlanningPolygon = async (
    question: Question,
    planningModeEnabled: boolean,
) => {
    if (planningModeEnabled && question.data.drag && !question.data.hidden) {
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

async function adjustMapGeoDataForQuestion(question: any, mapGeoData: any) {
    if (question.data.hidden) {
        return mapGeoData;
    }


    try {
        switch (question?.id) {
            case "radius":
                return await adjustPerRadius(question.data, mapGeoData);
            case "thermometer":
                return adjustPerThermometer(question.data, mapGeoData);
            case "tentacles":
                if (question.data.location === false) {
                    return adjustPerRadius(
                        { ...question.data, within: false },
                        mapGeoData,
                    );
                }
                return await adjustPerTentacle(question.data, mapGeoData);
            case "matching":
                return await adjustPerMatching(question.data, mapGeoData);
            case "measuring":
                return await adjustPerMeasuring(question.data, mapGeoData);
            default:
                return mapGeoData;
        }
    } catch {
        return mapGeoData;
    }
}

export async function applyQuestionsToMapGeoData(
    questions: Questions,
    mapGeoData: any,
    planningModeEnabled: boolean,
    planningModeCallback?: (
        polygon: FeatureCollection | Feature,
        question: any,
    ) => void,
): Promise<any> {
    for (const question of questions) {
        if (!question?.data) {
            continue;
        }
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

        mapGeoData = await adjustMapGeoDataForQuestion(question, mapGeoData);

        if (!mapGeoData || typeof mapGeoData !== "object") {
            mapGeoData = {
                type: "FeatureCollection",
                features: [],
            };
            continue;
        }

        if ((mapGeoData as { type?: string }).type !== "FeatureCollection") {
            mapGeoData = {
                type: "FeatureCollection",
                features: [mapGeoData],
            };
        }
    }
    return mapGeoData;
}
