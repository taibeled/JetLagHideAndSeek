import type * as React from "react";

import { MatchingQuestionComponent } from "@/components/cards/matching";
import { MeasuringQuestionComponent } from "@/components/cards/measuring";
import { RadiusQuestionComponent } from "@/components/cards/radius";
import type { QuestionCardComponentProps } from "@/components/cards/shared";
import { TentacleQuestionComponent } from "@/components/cards/tentacles";
import { ThermometerQuestionComponent } from "@/components/cards/thermometer";
import type { Question } from "@/maps/schema";

export { MatchingQuestionComponent } from "@/components/cards/matching";
export { MeasuringQuestionComponent } from "@/components/cards/measuring";
export { RadiusQuestionComponent } from "@/components/cards/radius";
export { TentacleQuestionComponent } from "@/components/cards/tentacles";
export { ThermometerQuestionComponent } from "@/components/cards/thermometer";

const QUESTION_CARDS: {
    [K in Question["id"]]: React.ComponentType<
        QuestionCardComponentProps<Extract<Question, { id: K }>["data"]>
    >;
} = {
    radius: RadiusQuestionComponent,
    thermometer: ThermometerQuestionComponent,
    tentacles: TentacleQuestionComponent,
    matching: MatchingQuestionComponent,
    measuring: MeasuringQuestionComponent,
};

/**
 * Renders the card belonging to a question. The lookup is keyed by the same
 * discriminator that types `question.data`, so the cast is safe — TypeScript
 * just cannot correlate the two sides of the index on its own.
 */
export const QuestionCardFor = ({
    question,
    sub,
}: {
    question: Question;
    sub?: string;
}) => {
    const Card = QUESTION_CARDS[question.id] as React.ComponentType<
        QuestionCardComponentProps<Question["data"]>
    >;

    return <Card data={question.data} questionKey={question.key} sub={sub} />;
};
