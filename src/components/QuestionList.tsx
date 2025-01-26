import { useStore } from "@nanostores/react";
import { cn } from "../utils/cn";
import { mapGeoLocation, questions, type Question } from "../utils/context";
import type { RadiusQuestion } from "../maps/radius";
import { Marker, Popup } from "react-leaflet";
import { VscChromeClose } from "react-icons/vsc";
import { Icon, type DragEndEvent } from "leaflet";
import { iconColors } from "../maps/api";
import { toast } from "react-toastify";
import * as turf from "@turf/turf";
import type { ThermometerQuestion } from "../maps/thermometer";
import { Fragment } from "react/jsx-runtime";

export const DraggableMarkers = () => {
    const $questions = useStore(questions);

    return (
        <Fragment>
            {$questions.map((question, index) => {
                if (!question.data) return null;
                if (!question.data.drag) return null;

                switch (question.id) {
                    case "radius":
                        return (
                            <ColoredMarker
                                color={
                                    (question.data as RadiusQuestion).color ??
                                    "gold"
                                }
                                key={question.key}
                                id="radius"
                                questionKey={question.key}
                                latitude={(question.data as RadiusQuestion).lat}
                                longitude={
                                    (question.data as RadiusQuestion).lng
                                }
                                onChange={(e) => {
                                    const newQuestions = [...$questions];
                                    (
                                        newQuestions[index]
                                            .data as RadiusQuestion
                                    ).lat = e.target.getLatLng().lat;
                                    (
                                        newQuestions[index]
                                            .data as RadiusQuestion
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
                                    sub=" A"
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
                                    sub=" B"
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

const RadiusQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: RadiusQuestion;
    questionKey: number;
    index: number;
}) => {
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
                                    newQuestions[index].data as RadiusQuestion
                                ).radius = parseInt(e.target.value);
                                questions.set(newQuestions);
                            }}
                        />
                        <select
                            className="rounded-md p-2 text-slate-900"
                            value={data.unit ?? "miles"}
                            onChange={(e) => {
                                const newQuestions = [...$questions];
                                newQuestions[index].data.unit = e.target
                                    .value as any;
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
                                    newQuestions[index].data as RadiusQuestion
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
                        (newQuestions[index].data as RadiusQuestion).lat = lat;
                    }
                    if (lng !== null) {
                        (newQuestions[index].data as RadiusQuestion).lng = lng;
                    }
                    questions.set(newQuestions);
                }}
            />
        </QuestionCard>
    );
};

const ThermometerQuestionComponent = ({
    data,
    questionKey,
    index,
}: {
    data: ThermometerQuestion;
    questionKey: number;
    index: number;
}) => {
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
                                        .data as ThermometerQuestion
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
                                newQuestions[index].data as ThermometerQuestion
                            ).latA = lat;
                        }
                        if (lng !== null) {
                            (
                                newQuestions[index].data as ThermometerQuestion
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
                                newQuestions[index].data as ThermometerQuestion
                            ).latB = lat;
                        }
                        if (lng !== null) {
                            (
                                newQuestions[index].data as ThermometerQuestion
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
                        default:
                            return null;
                    }
                })}
            </div>
            <div className="mt-4 flex flex-row gap-4">
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
            </div>
        </div>
    );
};

const LatitudeLongitude = ({
    latitude,
    longitude,
    onChange,
    latLabel = "Latitude",
    lngLabel = "Longitude",
    children,
    className = "",
}: {
    latitude: number;
    longitude: number;
    onChange: (lat: number | null, lng: number | null) => void;
    latLabel?: string;
    lngLabel?: string;
    className?: string;
    children?: React.ReactNode;
}) => {
    return (
        <div
            className={cn(
                "flex flex-col items-center gap-3 md:items-end md:flex-row",
                className
            )}
        >
            <div className="flex flex-col gap-2 ml-4">
                <label className="text-white text-3xl italic font-semibold font-poppins">
                    {latLabel}
                </label>
                <input
                    type="number"
                    className="rounded-md p-2 text-slate-900"
                    value={latitude}
                    onChange={(e) => {
                        onChange(parseFloat(e.target.value), null);
                    }}
                />
            </div>
            <div className="flex flex-col gap-2 ml-4">
                <label className="text-white text-3xl italic font-semibold font-poppins">
                    {lngLabel}
                </label>
                <input
                    type="number"
                    className="rounded-md p-2 text-slate-900"
                    value={longitude}
                    onChange={(e) => {
                        onChange(null, parseFloat(e.target.value));
                    }}
                />
            </div>
            <div className="flex items-end flex-grow ml-3">
                <button
                    className="bg-blue-600 p-2 rounded-md hover:shadow-blue-300 hover:shadow-md focus:shadow-blue-400 focus:shadow-inner font-semibold font-poppins transition-shadow duration-500"
                    onClick={() => {
                        if (!navigator || !navigator.geolocation)
                            return alert("Geolocation not supported");

                        toast.promise(
                            new Promise<GeolocationPosition>(
                                (resolve, reject) => {
                                    navigator.geolocation.getCurrentPosition(
                                        resolve,
                                        reject,
                                        {
                                            maximumAge: 0,
                                            enableHighAccuracy: true,
                                        }
                                    );
                                }
                            ).then((position) => {
                                onChange(
                                    position.coords.latitude,
                                    position.coords.longitude
                                );
                            }),
                            {
                                pending: "Fetching location",
                                success: "Location fetched",
                                error: "Could not fetch location",
                            },
                            { autoClose: 500 }
                        );
                    }}
                >
                    Current
                </button>
            </div>
            {children}
        </div>
    );
};

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
