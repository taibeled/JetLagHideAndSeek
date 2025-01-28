import type { RadiusQuestion } from "../maps/radius";
import type { ThermometerQuestion } from "../maps/thermometer";
import type { TentacleQuestion } from "../maps/tentacles";
import { VscChromeClose } from "react-icons/vsc";
import { Suspense, use } from "react";
import { LatitudeLongitude } from "./LatLngPicker";
import { useStore } from "@nanostores/react";
import { cn } from "../utils/cn";
import { questions } from "../utils/context";
import { findTentacleLocations, iconColors } from "../maps/api";
import type { MatchingQuestion } from "../maps/matching";

const QuestionCard = ({
    children,
    questionKey,
    className,
}: {
    children: React.ReactNode;
    questionKey: number;
    className?: string;
}) => {
    const $questions = useStore(questions);

    return (
        <div className={cn("flex flex-shrink-0", className)}>
            <div className="bg-slate-900 rounded-md shadow-lg shadow-slate-500 relative p-4">
                <button
                    className="absolute top-2 right-2 text-white"
                    onClick={() => {
                        questions.set(
                            $questions.filter((q) => q.key !== questionKey)
                        );
                    }}
                >
                    <VscChromeClose />
                </button>
                {children}
            </div>
        </div>
    );
};

export const RadiusQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: RadiusQuestion;
    questionKey: number;
    index: number;
}) => {
    type QuestionData = RadiusQuestion;

    const $questions = useStore(questions);

    return (
        <QuestionCard questionKey={questionKey}>
            <div className="flex flex-col items-center gap-2 md:items-start md:flex-row mb-2">
                <div className="flex flex-col gap-2 ml-4">
                    <label className="text-white text-3xl italic font-semibold font-poppins">
                        Radius{" "}
                        {$questions
                            .filter((q) => q.id === "radius")
                            .map((q) => q.key)
                            .indexOf(questionKey) + 1}
                    </label>
                    <div className="gap-2 flex flex-row">
                        <input
                            type="number"
                            className="rounded-md p-2 text-slate-900 w-16"
                            value={data.radius}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).radius = parseInt(e.target.value);
                                questions.set(newQuestions);
                            }}
                        />
                        <select
                            className="rounded-md p-2 text-slate-900"
                            value={data.unit ?? "miles"}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).unit = e.target.value as any;
                                questions.set(newQuestions);
                            }}
                        >
                            <option value="miles">Miles</option>
                            <option value="kilometers">Kilometers</option>
                            <option value="meters">Meters</option>
                        </select>
                    </div>
                </div>
                <div className="flex flex-grow flex-col mt-2 gap-2 md:mt-0">
                    <div className="flex items-center flex-1 justify-center gap-2 ml-4">
                        <label className="text-white text-3xl italic font-semibold font-poppins">
                            Within
                        </label>
                        <input
                            type="checkbox"
                            className="rounded-md p-2 text-slate-900 scale-150"
                            checked={data.within}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).within = e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                    </div>
                    <span
                        className="text-3xl italic font-semibold font-poppins text-center ml-4"
                        style={{ color: iconColors[data.color ?? "gold"] }}
                    >
                        Color (drag{" "}
                        <input
                            type="checkbox"
                            className="scale-150 mr-2"
                            checked={data.drag ?? false}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                newQuestions[index].data.drag =
                                    e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                        )
                    </span>
                </div>
            </div>
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                onChange={(lat, lng) => {
                    const newQuestions = [...$questions];
                    if (lat !== null) {
                        (newQuestions[index].data as QuestionData).lat = lat;
                    }
                    if (lng !== null) {
                        (newQuestions[index].data as QuestionData).lng = lng;
                    }
                    questions.set(newQuestions);
                }}
            />
        </QuestionCard>
    );
};

export const MatchingQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: MatchingQuestion;
    questionKey: number;
    index: number;
}) => {
    type QuestionData = MatchingQuestion;

    const $questions = useStore(questions);

    return (
        <QuestionCard questionKey={questionKey}>
            <div className="flex flex-col items-center gap-2 md:items-start md:flex-row mb-2">
                <div className="flex flex-col gap-2 ml-4">
                    <label className="text-white text-3xl italic font-semibold font-poppins">
                        Matching{" "}
                        {$questions
                            .filter((q) => q.id === "matching")
                            .map((q) => q.key)
                            .indexOf(questionKey) + 1}
                    </label>
                    <div className="gap-2 flex flex-row">
                        <select
                            className="rounded-md p-2 text-slate-900"
                            value={data.cat.adminLevel}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).cat.adminLevel = parseInt(e.target.value) as any;
                                questions.set(newQuestions);
                            }}
                        >
                            <option value="3">Zone 1</option>
                            <option value="4">Zone 2</option>
                            <option value="5">Zone 3</option>
                            <option value="6">Zone 4</option>
                        </select>
                    </div>
                </div>
                <div className="flex flex-grow flex-col mt-2 gap-2 md:mt-0">
                    <div className="flex items-center flex-1 justify-center gap-2 ml-4">
                        <label className="text-white text-3xl italic font-semibold font-poppins">
                            Same
                        </label>
                        <input
                            type="checkbox"
                            className="rounded-md p-2 text-slate-900 scale-150"
                            checked={data.same}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).same = e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                    </div>
                    <span
                        className="text-3xl italic font-semibold font-poppins text-center ml-4"
                        style={{ color: iconColors[data.color ?? "gold"] }}
                    >
                        Color (drag{" "}
                        <input
                            type="checkbox"
                            className="scale-150 mr-2"
                            checked={data.drag ?? false}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                newQuestions[index].data.drag =
                                    e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                        )
                    </span>
                </div>
            </div>
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                onChange={(lat, lng) => {
                    const newQuestions = [...$questions];
                    if (lat !== null) {
                        (newQuestions[index].data as QuestionData).lat = lat;
                    }
                    if (lng !== null) {
                        (newQuestions[index].data as QuestionData).lng = lng;
                    }
                    questions.set(newQuestions);
                }}
            />
        </QuestionCard>
    );
};

export const TentacleQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: TentacleQuestion;
    questionKey: number;
    index: number;
}) => {
    type QuestionData = TentacleQuestion;

    const $questions = useStore(questions);

    return (
        <QuestionCard questionKey={questionKey}>
            <div className="flex flex-col items-center gap-2 md:items-start md:flex-row mb-2">
                <div className="flex flex-col gap-2 ml-4 items-center">
                    <label className="text-white text-3xl italic font-semibold font-poppins">
                        Tentacles{" "}
                        {$questions
                            .filter((q) => q.id === "tentacles")
                            .map((q) => q.key)
                            .indexOf(questionKey) + 1}
                    </label>
                    <div className="gap-2 flex flex-row">
                        <select
                            className="rounded-md p-2 text-slate-900"
                            value={data.radius}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index].data as QuestionData
                                ).radius = parseInt(e.target.value) as 1 | 15;
                                questions.set(newQuestions);
                            }}
                        >
                            <option value="15">15 Miles</option>
                            <option value="1">1 Mile</option>
                        </select>
                    </div>
                </div>
                <div className="flex flex-grow flex-col mt-2 gap-2 md:mt-0 items-center">
                    <select
                        className="rounded-md p-2 text-slate-900 w-[90%] md:w-[50%]"
                        value={data.locationType}
                        onChange={(e) => {
                            const newQuestions = [...$questions];
                            (
                                newQuestions[index].data as QuestionData
                            ).locationType = e.target.value as any;
                            questions.set(newQuestions);
                        }}
                    >
                        <option value="theme_park">Theme Parks</option>
                        <option value="zoo">Zoos</option>
                        <option value="museum">Museums</option>
                        <option value="aquarium">Aquariums</option>
                        <option value="hospital">Hospitals</option>
                    </select>
                    <span
                        className="text-3xl italic font-semibold font-poppins text-center ml-4"
                        style={{ color: iconColors[data.color ?? "gold"] }}
                    >
                        Color (drag{" "}
                        <input
                            type="checkbox"
                            className="scale-150 mr-2"
                            checked={data.drag ?? false}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                newQuestions[index].data.drag =
                                    e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                        )
                    </span>
                </div>
            </div>
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                onChange={(lat, lng) => {
                    const newQuestions = [...$questions];
                    if (lat !== null) {
                        (newQuestions[index].data as QuestionData).lat =
                            lat;
                    }
                    if (lng !== null) {
                        (newQuestions[index].data as QuestionData).lng =
                            lng;
                    }
                    questions.set(newQuestions);
                }}
            />
            <div className="flex mt-4 justify-center">
                <Suspense fallback={<div>Loading...</div>}>
                    <TentacleLocationSelector
                        data={data}
                        index={index}
                        promise={findTentacleLocations(data)}
                    />
                </Suspense>
            </div>
        </QuestionCard>
    );
};

const TentacleLocationSelector = ({
    data,
    index,
    promise,
}: {
    data: TentacleQuestion;
    index: number;
    promise: Promise<any>;
}) => {
    const $questions = useStore(questions);
    const locations = use(promise);

    return (
        <select
            className="rounded-md p-2 text-slate-900 w-[90%] md:w-[50%]"
            value={data.location ? data.location.properties.name : "false"}
            onChange={(e) => {
                const newQuestions = [...$questions];
                if (e.target.value === "false") {
                    (newQuestions[index].data as TentacleQuestion).location =
                        false;
                } else {
                    (newQuestions[index].data as TentacleQuestion).location =
                        locations.features.find(
                            (feature: any) =>
                                feature.properties.name === e.target.value
                        );
                }
                questions.set(newQuestions);
            }}
        >
            <option value="false">Not Within</option>
            {locations.features.map((feature: any) => (
                <option
                    key={feature.properties.name}
                    value={feature.properties.name}
                >
                    {feature.properties.name}
                </option>
            ))}
        </select>
    );
};

export const ThermometerQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: ThermometerQuestion;
    questionKey: number;
    index: number;
}) => {
    type QuestionData = ThermometerQuestion;

    const $questions = useStore(questions);

    return (
        <QuestionCard questionKey={questionKey}>
            <div className="flex flex-col gap-3 md:gap-1 md:flex-row justify-between pr-8">
                <label className="text-white text-3xl italic font-semibold font-poppins">
                    Thermometer{" "}
                    {$questions
                        .filter((q) => q.id === "thermometer")
                        .map((q) => q.key)
                        .indexOf(questionKey) + 1}
                </label>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center flex-1 justify-center gap-2 ml-4">
                        <label className="text-white text-3xl italic font-semibold font-poppins mr-1">
                            Warmer
                        </label>
                        <input
                            type="checkbox"
                            className="rounded-md p-2 text-slate-900 scale-150"
                            checked={data.warmer}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                (
                                    newQuestions[index]
                                        .data as QuestionData
                                ).warmer = e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                    </div>
                </div>
            </div>
            <div className="flex flex-col gap-6 mt-4">
                <LatitudeLongitude
                    latitude={data.latA}
                    longitude={data.lngA}
                    latLabel="Latitude A"
                    lngLabel="Longitude A"
                    onChange={(lat, lng) => {
                        const newQuestions = [...$questions];
                        if (lat !== null) {
                            (
                                newQuestions[index].data as QuestionData
                            ).latA = lat;
                        }
                        if (lng !== null) {
                            (
                                newQuestions[index].data as QuestionData
                            ).lngA = lng;
                        }
                        questions.set(newQuestions);
                    }}
                >
                    <span
                        className="text-3xl italic font-semibold font-poppins text-center ml-4"
                        style={{ color: iconColors[data.colorA ?? "gold"] }}
                    >
                        Color A (drag{" "}
                        <input
                            type="checkbox"
                            className="scale-150 mr-2"
                            checked={data.drag ?? false}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                newQuestions[index].data.drag =
                                    e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                        )
                    </span>
                </LatitudeLongitude>
                <LatitudeLongitude
                    latitude={data.latB}
                    longitude={data.lngB}
                    latLabel="Latitude B"
                    lngLabel="Longitude B"
                    onChange={(lat, lng) => {
                        const newQuestions = [...$questions];
                        if (lat !== null) {
                            (
                                newQuestions[index].data as QuestionData
                            ).latB = lat;
                        }
                        if (lng !== null) {
                            (
                                newQuestions[index].data as QuestionData
                            ).lngB = lng;
                        }
                        questions.set(newQuestions);
                    }}
                >
                    <span
                        className="text-3xl italic font-semibold font-poppins text-center ml-4"
                        style={{ color: iconColors[data.colorB ?? "gold"] }}
                    >
                        Color B (drag{" "}
                        <input
                            type="checkbox"
                            className="scale-150 mr-2"
                            checked={data.drag ?? false}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                newQuestions[index].data.drag =
                                    e.target.checked;
                                questions.set(newQuestions);
                            }}
                        />
                        )
                    </span>
                </LatitudeLongitude>
            </div>
        </QuestionCard>
    );
};
