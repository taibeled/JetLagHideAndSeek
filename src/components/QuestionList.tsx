import { useStore } from "@nanostores/react";
import { cn } from "../utils/cn";
import { mapGeoLocation, questions} from "../utils/context";
import { iconColors } from "../maps/api";
import * as turf from "@turf/turf";
import { RadiusQuestionComponent, TentacleQuestionComponent, ThermometerQuestionComponent } from "./QuestionCards";

export const QuestionList = ({ className }: { className?: string }) => {
    const $questions = useStore(questions);

    return (
        <div className={cn("flex items-center flex-col pb-4 gap-4", className)}>
            <h2 className="text-4xl font-semibold font-poppins">Questions</h2>
            <div className="flex flex-col gap-4 items-center">
                {$questions.map((question, index) => {
                    switch (question.id) {
                        case "radius":
                            return (
                                <RadiusQuestionComponent
                                    data={question.data}
                                    key={question.key}
                                    questionKey={question.key}
                                    index={index}
                                />
                            );
                        case "thermometer":
                            return (
                                <ThermometerQuestionComponent
                                    data={question.data}
                                    key={question.key}
                                    questionKey={question.key}
                                    index={index}
                                />
                            );
                        case "tentacles":
                            return (
                                <TentacleQuestionComponent
                                    data={question.data}
                                    key={question.key}
                                    questionKey={question.key}
                                    index={index}
                                />
                            );
                        default:
                            return null;
                    }
                })}
            </div>
            <div className="mt-4 flex flex-col md:flex-row gap-4">
                <button
                    className="bg-slate-900 text-white px-4 py-2 rounded-md shadow-lg shadow-slate-500"
                    onClick={() => {
                        questions.set([
                            ...$questions,
                            {
                                id: "radius",
                                key: Math.random() * 1e9,
                                data: {
                                    radius: 50,
                                    lat: mapGeoLocation.get().geometry
                                        .coordinates[0],
                                    lng: mapGeoLocation.get().geometry
                                        .coordinates[1],
                                    within: false,
                                    color: Object.keys(iconColors)[
                                        Math.floor(
                                            Math.random() *
                                                Object.keys(iconColors).length
                                        )
                                    ] as keyof typeof iconColors,
                                    drag: true,
                                },
                            },
                        ]);
                    }}
                >
                    Add Radius
                </button>
                <button
                    className="bg-slate-900 text-white px-4 py-2 rounded-md shadow-lg shadow-slate-500"
                    onClick={() => {
                        const center = turf.point([
                            mapGeoLocation.get().geometry.coordinates[1],
                            mapGeoLocation.get().geometry.coordinates[0],
                        ]);

                        const destination = turf.destination(center, 5, 90, {
                            units: "miles",
                        });

                        questions.set([
                            ...$questions,
                            {
                                id: "thermometer",
                                key: Math.random() * 1e9,
                                data: {
                                    colorA: Object.keys(iconColors)[
                                        Math.floor(
                                            Math.random() *
                                                Object.keys(iconColors).length
                                        )
                                    ] as keyof typeof iconColors,
                                    colorB: Object.keys(iconColors)[
                                        Math.floor(
                                            Math.random() *
                                                Object.keys(iconColors).length
                                        )
                                    ] as keyof typeof iconColors,
                                    latA: center.geometry.coordinates[1],
                                    lngA: center.geometry.coordinates[0],
                                    latB: destination.geometry.coordinates[1],
                                    lngB: destination.geometry.coordinates[0],
                                    distance: 5,
                                    warmer: true,
                                    drag: true,
                                },
                            },
                        ]);
                    }}
                >
                    Add Thermometer
                </button>
                <button
                    className="bg-slate-900 text-white px-4 py-2 rounded-md shadow-lg shadow-slate-500"
                    onClick={() => {
                        const center = turf.point([
                            mapGeoLocation.get().geometry.coordinates[1],
                            mapGeoLocation.get().geometry.coordinates[0],
                        ]);

                        questions.set([
                            ...$questions,
                            {
                                id: "tentacles",
                                key: Math.random() * 1e9,
                                data: {
                                    color: Object.keys(iconColors)[
                                        Math.floor(
                                            Math.random() *
                                                Object.keys(iconColors).length
                                        )
                                    ] as keyof typeof iconColors,
                                    lat: center.geometry.coordinates[1],
                                    lng: center.geometry.coordinates[0],
                                    drag: true,
                                    location: false,
                                    locationType: "theme_park",
                                    radius: 15,
                                },
                            },
                        ]);
                    }}
                >
                    Add Tentacles
                </button>
            </div>
        </div>
    );
};
