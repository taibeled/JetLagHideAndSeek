import { Icon, type DragEndEvent } from "leaflet";
import { Marker } from "react-leaflet";
import { Fragment } from "react/jsx-runtime";
import type { iconColors } from "../maps/api";
import { useStore } from "@nanostores/react";
import { hiderMode, questions } from "../lib/context";
import {
    RadiusQuestionComponent,
    ThermometerQuestionComponent,
    TentacleQuestionComponent,
    MatchingQuestionComponent,
    MeasuringQuestionComponent,
} from "./QuestionCards";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState } from "react";
import { Button } from "./ui/button";
import { SidebarMenu } from "./ui/sidebar-l";
import { LatitudeLongitude } from "./LatLngPicker";

let isDragging = false;

const ColoredMarker = ({
    latitude,
    longitude,
    color,
    onChange,
    questionKey,
    sub = "",
}: {
    onChange: (event: DragEndEvent) => void;
    latitude: number;
    longitude: number;
    color: keyof typeof iconColors;
    questionKey: number;
    sub?: string;
}) => {
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
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
                    dragstart: () => {
                        isDragging = true;
                    },
                    dragend: (x) => {
                        onChange(x);
                        setTimeout(() => {
                            isDragging = false;
                        }, 100);
                    },
                    click: () => {
                        if (!isDragging) {
                            setOpen(true);
                        }
                    },
                }}
            />
            <DialogContent className="!bg-[hsl(var(--sidebar-background))] !text-white">
                {questionKey === -1 && $hiderMode !== false && (
                    <>
                        <h2 className="text-center text-2xl font-bold font-poppins">
                            {sub}
                        </h2>
                        <SidebarMenu>
                            <LatitudeLongitude
                                latitude={$hiderMode.latitude}
                                longitude={$hiderMode.longitude}
                                onChange={(latitude, longitude) => {
                                    hiderMode.set({
                                        latitude:
                                            latitude ?? $hiderMode.latitude,
                                        longitude:
                                            longitude ?? $hiderMode.longitude,
                                    });
                                }}
                                latLabel="Hider Latitude"
                                lngLabel="Hider Longitude"
                            />
                        </SidebarMenu>
                    </>
                )}
                {$questions
                    .filter((q) => q.key === questionKey)
                    .map((q) => {
                        switch (q.id) {
                            case "radius":
                                return (
                                    <RadiusQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                        showDeleteButton={false}
                                    />
                                );
                            case "tentacles":
                                return (
                                    <TentacleQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                        showDeleteButton={false}
                                    />
                                );
                            case "thermometer":
                                return (
                                    <ThermometerQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                        showDeleteButton={false}
                                    />
                                );
                            case "matching":
                                return (
                                    <MatchingQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                        showDeleteButton={false}
                                    />
                                );
                            case "measuring":
                                return (
                                    <MeasuringQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        index={$questions.findIndex(
                                            (question) =>
                                                question.key === q.key,
                                        )}
                                        sub={sub}
                                        showDeleteButton={false}
                                    />
                                );
                            default:
                                return null;
                        }
                    })}
                {questionKey !== -1 && (
                    <Button
                        onClick={() => {
                            questions.set(
                                $questions.filter((q) => q.key !== questionKey),
                            );
                        }}
                        variant="destructive"
                    >
                        Delete
                    </Button>
                )}
            </DialogContent>
        </Dialog>
    );
};

export const DraggableMarkers = () => {
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);

    return (
        <Fragment>
            {$hiderMode !== false && (
                <ColoredMarker
                    color="green"
                    key="hider"
                    sub="Hider Location"
                    questionKey={-1}
                    latitude={$hiderMode.latitude}
                    longitude={$hiderMode.longitude}
                    onChange={(e) => {
                        hiderMode.set({
                            latitude: e.target.getLatLng().lat,
                            longitude: e.target.getLatLng().lng,
                        });
                    }}
                />
            )}
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
                                color={question.data.color}
                                key={question.key}
                                questionKey={question.key}
                                latitude={question.data.lat}
                                longitude={question.data.lng}
                                onChange={(e) => {
                                    const newQuestions = [...$questions];
                                    (
                                        newQuestions[index] as typeof question
                                    ).data.lat = e.target.getLatLng().lat;
                                    (
                                        newQuestions[index] as typeof question
                                    ).data.lng = e.target.getLatLng().lng;
                                    questions.set(newQuestions);
                                }}
                            />
                        );
                    case "thermometer":
                        return (
                            <Fragment key={question.key}>
                                <ColoredMarker
                                    color={question.data.colorA}
                                    key={"a" + question.key.toString()}
                                    questionKey={question.key}
                                    sub="Start"
                                    latitude={question.data.latA}
                                    longitude={question.data.lngA}
                                    onChange={(e) => {
                                        const newQuestions = [...$questions];
                                        (
                                            newQuestions[
                                                index
                                            ] as typeof question
                                        ).data.latA = e.target.getLatLng().lat;
                                        (
                                            newQuestions[
                                                index
                                            ] as typeof question
                                        ).data.lngA = e.target.getLatLng().lng;
                                        questions.set(newQuestions);
                                    }}
                                />
                                <ColoredMarker
                                    color={question.data.colorB}
                                    key={"b" + question.key.toString()}
                                    questionKey={question.key}
                                    sub="End"
                                    latitude={question.data.latB}
                                    longitude={question.data.lngB}
                                    onChange={(e) => {
                                        const newQuestions = [...$questions];
                                        (
                                            newQuestions[
                                                index
                                            ] as typeof question
                                        ).data.latB = e.target.getLatLng().lat;
                                        (
                                            newQuestions[
                                                index
                                            ] as typeof question
                                        ).data.lngB = e.target.getLatLng().lng;
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
