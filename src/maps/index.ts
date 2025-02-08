import type { Question } from "@/lib/context";
import { hiderifyRadius } from "./radius";
import { hiderifyThermometer } from "./thermometer";
import { hiderifyTentacles } from "./tentacles";
import { hiderifyMatching } from "./matching";
import { hiderifyMeasuring } from "./measuring";

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
