import { Icon, type DragEndEvent } from "leaflet";
import { Marker, Popup } from "react-leaflet";
import { Fragment } from "react/jsx-runtime";
import type { iconColors } from "../maps/api";
import { useStore } from "@nanostores/react";
import { questions } from "../utils/context";
import type { RadiusQuestion } from "../maps/radius";
import type { TentacleQuestion } from "../maps/tentacles";
import type { ThermometerQuestion } from "../maps/thermometer";
import type { MatchingQuestion } from "../maps/matching";

const ColoredMarker = ({
    latitude,
    longitude,
    color,
    onChange,
    questionKey,
    id,
    sub = "",
}: {
    questionKey: number;
    onChange: (event: DragEndEvent) => void;
    latitude: number;
    longitude: number;
    id: string;
    color: keyof typeof iconColors;
    sub?: string;
}) => {
    const $questions = useStore(questions);

    return (
        <Marker
            position={[latitude, longitude]}
            icon={
                color
                    ? new Icon({
                          iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
                          shadowUrl:
                              "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
                          iconSize: [25, 41],
                          iconAnchor: [12, 41],
                          popupAnchor: [1, -34],
                          shadowSize: [41, 41],
                      })
                    : undefined
            }
            draggable={true}
            eventHandlers={{
                dragend: onChange,
            }}
        >
            <Popup>
                <span className="capitalize">
                    {id}{" "}
                    {$questions
                        .filter((q) => q.id === id)
                        .map((q) => q.key)
                        .indexOf(questionKey) + 1}{" "}
                    {sub}
                </span>
            </Popup>
        </Marker>
    );
};

export const DraggableMarkers = () => {
    const $questions = useStore(questions);

    return (
        <Fragment>
            {$questions.map((question, index) => {
                if (!question.data) return null;
                if (!question.data.drag) return null;

                switch (question.id) {
                    case "radius":
                    case "tentacles":
                    case "matching":
                    case "measuring":
                        return (
                            <ColoredMarker
                                color={
                                    (
                                        question.data as
                                            | RadiusQuestion
                                            | TentacleQuestion
                                            | MatchingQuestion
                                    ).color ?? "gold"
                                }
                                key={question.key}
                                id={question.id}
                                questionKey={question.key}
                                latitude={
                                    (
                                        question.data as
                                            | RadiusQuestion
                                            | TentacleQuestion
                                            | MatchingQuestion
                                    ).lat
                                }
                                longitude={
                                    (
                                        question.data as
                                            | RadiusQuestion
                                            | TentacleQuestion
                                            | MatchingQuestion
                                    ).lng
                                }
                                onChange={(e) => {
                                    const newQuestions = [...$questions];
                                    (
                                        newQuestions[index].data as
                                            | RadiusQuestion
                                            | TentacleQuestion
                                            | MatchingQuestion
                                    ).lat = e.target.getLatLng().lat;
                                    (
                                        newQuestions[index].data as
                                            | RadiusQuestion
                                            | TentacleQuestion
                                            | MatchingQuestion
                                    ).lng = e.target.getLatLng().lng;
                                    questions.set(newQuestions);
                                }}
                            />
                        );
                    case "thermometer":
                        return (
                            <Fragment key={question.key}>
                                <ColoredMarker
                                    color={
                                        (question.data as ThermometerQuestion)
                                            .colorA ?? "gold"
                                    }
                                    key={"a" + question.key.toString()}
                                    sub=" Start"
                                    id="thermometer"
                                    questionKey={question.key}
                                    latitude={
                                        (question.data as ThermometerQuestion)
                                            .latA
                                    }
                                    longitude={
                                        (question.data as ThermometerQuestion)
                                            .lngA
                                    }
                                    onChange={(e) => {
                                        const newQuestions = [...$questions];
                                        (
                                            newQuestions[index]
                                                .data as ThermometerQuestion
                                        ).latA = e.target.getLatLng().lat;
                                        (
                                            newQuestions[index]
                                                .data as ThermometerQuestion
                                        ).lngA = e.target.getLatLng().lng;
                                        questions.set(newQuestions);
                                    }}
                                />
                                <ColoredMarker
                                    color={
                                        (question.data as ThermometerQuestion)
                                            .colorB ?? "gold"
                                    }
                                    key={"b" + question.key.toString()}
                                    sub=" End"
                                    id="thermometer"
                                    questionKey={question.key}
                                    latitude={
                                        (question.data as ThermometerQuestion)
                                            .latB
                                    }
                                    longitude={
                                        (question.data as ThermometerQuestion)
                                            .lngB
                                    }
                                    onChange={(e) => {
                                        const newQuestions = [...$questions];
                                        (
                                            newQuestions[index]
                                                .data as ThermometerQuestion
                                        ).latB = e.target.getLatLng().lat;
                                        (
                                            newQuestions[index]
                                                .data as ThermometerQuestion
                                        ).lngB = e.target.getLatLng().lng;
                                        questions.set(newQuestions);
                                    }}
                                />
                            </Fragment>
                        );
                    default:
                        return null;
                }
            })}
        </Fragment>
    );
};
