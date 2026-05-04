import { MatchingQuestionComponent } from "./cards/matching";
import { MeasuringQuestionComponent } from "./cards/measuring";
import { RadiusQuestionComponent } from "./cards/radius";
import { TentacleQuestionComponent } from "./cards/tentacles";
import { ThermometerQuestionComponent } from "./cards/thermometer";

export { MatchingQuestionComponent };
export { MeasuringQuestionComponent };
export { RadiusQuestionComponent };
export { TentacleQuestionComponent };
export { ThermometerQuestionComponent };

export function renderQuestionCard(
    question: { id: string; key: number; data: any },
    sub?: string,
) {
    switch (question.id) {
        case "radius":
            return (
                <RadiusQuestionComponent
                    key={question.key}
                    data={question.data}
                    questionKey={question.key}
                    sub={sub}
                />
            );
        case "tentacles":
            return (
                <TentacleQuestionComponent
                    key={question.key}
                    data={question.data}
                    questionKey={question.key}
                    sub={sub}
                />
            );
        case "thermometer":
            return (
                <ThermometerQuestionComponent
                    key={question.key}
                    data={question.data}
                    questionKey={question.key}
                    sub={sub}
                />
            );
        case "matching":
            return (
                <MatchingQuestionComponent
                    key={question.key}
                    data={question.data}
                    questionKey={question.key}
                    sub={sub}
                />
            );
        case "measuring":
            return (
                <MeasuringQuestionComponent
                    key={question.key}
                    data={question.data}
                    questionKey={question.key}
                    sub={sub}
                />
            );
        default:
            return null;
    }
}
