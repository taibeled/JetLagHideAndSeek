import { useStore } from "@nanostores/react";
import { DivIcon, type DragEndEvent, Icon } from "leaflet";
import { useState } from "react";
import { Fragment } from "react/jsx-runtime";
import { Marker } from "react-leaflet";

import { LatitudeLongitude } from "@/components/LatLngPicker";
import { QuestionCardFor } from "@/components/QuestionCards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SidebarMenu } from "@/components/ui/sidebar-l";
import {
    autoSave,
    hiderMode,
    questionModified,
    questions,
    save,
    startingLocation,
    triggerLocalRefresh,
} from "@/lib/context";
import {
    ICON_COLORS,
    type IconColorKey,
    LEAFLET_COLOR_MARKER_SLUGS,
} from "@/maps/api";

let isDragging = false;

const LEAFLET_MARKER_LAYOUT = {
    shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41] as [number, number],
    iconAnchor: [12, 41] as [number, number],
    popupAnchor: [1, -34] as [number, number],
    shadowSize: [41, 41] as [number, number],
};

function iconForPinColor(color: IconColorKey) {
    if (LEAFLET_COLOR_MARKER_SLUGS.has(color)) {
        return new Icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
            ...LEAFLET_MARKER_LAYOUT,
        });
    }
    const hex = ICON_COLORS[color];
    return new DivIcon({
        className: "jl-hex-pin",
        html: `<div class="jl-hex-pin__blob" style="background-color:${hex}"></div>`,
        iconSize: [28, 36],
        iconAnchor: [14, 34],
        popupAnchor: [0, -30],
    });
}

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
    color: IconColorKey;
    questionKey: number;
    sub?: string;
}) => {
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);
    const $startingLocation = useStore(startingLocation);
    const $autoSave = useStore(autoSave);
    const [open, setOpen] = useState(false);

    // The starting-location and hider markers edit a store instead of a
    // question, and are otherwise identical.
    const storeMarker =
        questionKey === -2 && $startingLocation !== false
            ? {
                  label: "Starting Location",
                  location: $startingLocation,
                  set: startingLocation.set.bind(startingLocation),
              }
            : questionKey === -1 && $hiderMode !== false
              ? {
                    label: "Hider Location",
                    location: $hiderMode,
                    set: hiderMode.set.bind(hiderMode),
                }
              : null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Marker
                position={[latitude, longitude]}
                icon={iconForPinColor(color)}
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
            <DialogContent className="bg-[hsl(var(--sidebar-background))]! text-white!">
                {storeMarker && (
                    <>
                        <h2 className="text-center text-2xl font-bold font-poppins">
                            {sub}
                        </h2>
                        <SidebarMenu>
                            <LatitudeLongitude
                                latitude={storeMarker.location.latitude}
                                longitude={storeMarker.location.longitude}
                                inlineEdit
                                onChange={(latitude, longitude) => {
                                    storeMarker.set({
                                        latitude:
                                            latitude ??
                                            storeMarker.location.latitude,
                                        longitude:
                                            longitude ??
                                            storeMarker.location.longitude,
                                    });
                                }}
                                label={storeMarker.label}
                            />
                        </SidebarMenu>
                    </>
                )}
                {$questions
                    .filter((q) => q.key === questionKey)
                    .map((q) => (
                        <QuestionCardFor key={q.key} question={q} sub={sub} />
                    ))}
                {(questionKey === -1 || questionKey === -2) && (
                    <Button // The starting-location or hider-mode marker
                        onClick={() => {
                            if (questionKey === -2) {
                                startingLocation.set(false);
                            } else {
                                hiderMode.set(false);
                            }
                        }}
                        variant="destructive"
                        className="font-semibold font-poppins"
                    >
                        Disable
                    </Button>
                )}
                {!$autoSave && (
                    <button
                        onClick={save}
                        className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500"
                    >
                        Save
                    </button>
                )}
            </DialogContent>
        </Dialog>
    );
};

export const DraggableMarkers = () => {
    useStore(triggerLocalRefresh);
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);
    const $startingLocation = useStore(startingLocation);

    return (
        <Fragment>
            {$startingLocation !== false && (
                <ColoredMarker
                    color="blue"
                    key="starting-location"
                    sub="Starting Location"
                    questionKey={-2}
                    latitude={$startingLocation.latitude}
                    longitude={$startingLocation.longitude}
                    onChange={(e) => {
                        $startingLocation.latitude =
                            e.target.getLatLng().lat ??
                            $startingLocation.latitude;
                        $startingLocation.longitude =
                            e.target.getLatLng().lng ??
                            $startingLocation.longitude;

                        if (autoSave.get()) {
                            startingLocation.set({ ...$startingLocation });
                        } else {
                            triggerLocalRefresh.set(Math.random());
                        }
                    }}
                />
            )}
            {$hiderMode !== false && (
                <ColoredMarker
                    color="green"
                    key="hider"
                    sub="Hider Location"
                    questionKey={-1}
                    latitude={$hiderMode.latitude}
                    longitude={$hiderMode.longitude}
                    onChange={(e) => {
                        $hiderMode.latitude =
                            e.target.getLatLng().lat ?? $hiderMode.latitude;
                        $hiderMode.longitude =
                            e.target.getLatLng().lng ?? $hiderMode.longitude;

                        if (autoSave.get()) {
                            hiderMode.set({
                                ...$hiderMode,
                            });
                        } else {
                            triggerLocalRefresh.set(Math.random());
                        }
                    }}
                />
            )}
            {$questions.map((question) => {
                if (!question.data) return null;
                if (!question.data.drag) return null;
                if (question.data.hidden) return null;
                if (
                    question.id === "matching" &&
                    question.data.type === "custom-zone"
                )
                    return null;

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
                                    question.data.lat =
                                        e.target.getLatLng().lat;
                                    question.data.lng =
                                        e.target.getLatLng().lng;
                                    questionModified();
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
                                        question.data.latA =
                                            e.target.getLatLng().lat;
                                        question.data.lngA =
                                            e.target.getLatLng().lng;
                                        questionModified();
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
                                        question.data.latB =
                                            e.target.getLatLng().lat;
                                        question.data.lngB =
                                            e.target.getLatLng().lng;
                                        questionModified();
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
