import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { type DragEndEvent, divIcon, Icon } from "leaflet";
import { useState } from "react";
import { Fragment } from "react/jsx-runtime";
import { Circle, Marker, Polyline } from "react-leaflet";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
    autoSave,
    hiderMode,
    questionModified,
    questions,
    save,
    triggerLocalRefresh,
} from "@/lib/context";
import type { ICON_COLORS } from "@/maps/api";
import { sessionParticipant, sessionQuestions } from "@/lib/session-context";
import type { SessionQuestion } from "@hideandseek/shared";

import { LatitudeLongitude } from "./LatLngPicker";
import {
    MatchingQuestionComponent,
    MeasuringQuestionComponent,
    RadiusQuestionComponent,
    TentacleQuestionComponent,
    ThermometerQuestionComponent,
} from "./QuestionCards";
import { Button } from "./ui/button";
import { SidebarMenu } from "./ui/sidebar-l";

let isDragging = false;

// ── Hider marker — red circle with glow ring (Figma node 1:8) ────────────────
const HIDER_ICON = divIcon({
    className: "",
    html: `<div style="
        width:20px;height:20px;
        background:#E8323A;
        border-radius:50%;
        border:3px solid #fff;
        box-shadow:0 0 0 4px rgba(232,50,58,0.35),0 2px 8px rgba(0,0,0,0.5);
        box-sizing:border-box;
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

// ── Seeker question helpers ───────────────────────────────────────────────────

const QUESTION_LABELS: Record<string, string> = {
    radius: "Radius",
    thermometer: "Thermometer",
    tentacles: "Tentakel",
    matching: "Matching",
    measuring: "Messen",
};

/** Extract the center lat/lng from a SessionQuestion's data field */
function extractQuestionCenter(
    sq: SessionQuestion,
): { lat: number; lng: number } | null {
    const d = sq.data as any;
    if (!d) return null;
    if (sq.type === "thermometer") {
        if (typeof d.latA === "number" && typeof d.lngA === "number") {
            return { lat: d.latA, lng: d.lngA };
        }
    } else {
        if (typeof d.lat === "number" && typeof d.lng === "number") {
            return { lat: d.lat, lng: d.lng };
        }
    }
    return null;
}

const ColoredMarker = ({
    latitude,
    longitude,
    color,
    onChange,
    questionKey,
    sub = "",
    draggable: isDraggableProp = true,
    customIcon,
}: {
    onChange: (event: DragEndEvent) => void;
    latitude: number;
    longitude: number;
    color: keyof typeof ICON_COLORS;
    questionKey: number;
    sub?: string;
    /** Whether the marker can be dragged. Defaults to true. */
    draggable?: boolean;
    /** Optional override icon (e.g. custom divIcon). Takes precedence over color. */
    customIcon?: ReturnType<typeof divIcon>;
}) => {
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);
    const $autoSave = useStore(autoSave);
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Marker
                position={[latitude, longitude]}
                icon={
                    customIcon
                        ? customIcon
                        : color
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
                draggable={isDraggableProp}
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
                                inlineEdit
                                onChange={(latitude, longitude) => {
                                    hiderMode.set({
                                        latitude:
                                            latitude ?? $hiderMode.latitude,
                                        longitude:
                                            longitude ?? $hiderMode.longitude,
                                    });
                                }}
                                label="Hider Location"
                            />
                        </SidebarMenu>
                    </>
                )}
                {questionKey === -2 && (
                    <h2 className="text-center text-xl font-bold font-poppins">
                        📍 Seeker: {sub}
                    </h2>
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
                                    />
                                );
                            case "tentacles":
                                return (
                                    <TentacleQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                    />
                                );
                            case "thermometer":
                                return (
                                    <ThermometerQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                    />
                                );
                            case "matching":
                                return (
                                    <MatchingQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                    />
                                );
                            case "measuring":
                                return (
                                    <MeasuringQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                    />
                                );
                            default:
                                return null;
                        }
                    })}
                {questionKey === -1 && (
                    <Button // If it's the hider mode marker
                        onClick={() => {
                            hiderMode.set(false);
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
    const $participant = useStore(sessionParticipant);
    const $sessionQuestions = useStore(sessionQuestions);

    return (
        <Fragment>
            {$hiderMode !== false && (
                <ColoredMarker
                    color="green"
                    customIcon={HIDER_ICON}
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
            {/* Blue pins + geometry outlines for all pending seeker questions – hider only */}
            {$participant?.role === "hider" &&
                $sessionQuestions
                    .filter((sq) => sq.status === "pending")
                    .map((sq) => {
                        const loc = extractQuestionCenter(sq);
                        if (!loc) return null;
                        const d = sq.data as any;
                        const isThermo = sq.type === "thermometer";
                        const hasBothPoints =
                            isThermo &&
                            typeof d?.latA === "number" &&
                            typeof d?.lngA === "number" &&
                            typeof d?.latB === "number" &&
                            typeof d?.lngB === "number";
                        const midLat = hasBothPoints ? (d.latA + d.latB) / 2 : 0;
                        const midLng = hasBothPoints ? (d.lngA + d.lngB) / 2 : 0;
                        return (
                            <Fragment key={"sq-" + sq.id}>
                                {/* Thermometer: blue pin at A (cold/start), red pin at B (warm/end) */}
                                {isThermo ? (
                                    <>
                                        <ColoredMarker
                                            color="blue"
                                            sub="❄️ Kalt (Start)"
                                            questionKey={-2}
                                            latitude={loc.lat}
                                            longitude={loc.lng}
                                            draggable={false}
                                            onChange={() => {}}
                                        />
                                        {hasBothPoints && (
                                            <ColoredMarker
                                                color="red"
                                                sub="🔥 Warm (Ziel)"
                                                questionKey={-2}
                                                latitude={d.latB}
                                                longitude={d.lngB}
                                                draggable={false}
                                                onChange={() => {}}
                                            />
                                        )}
                                    </>
                                ) : (
                                    /* All other question types: one blue pin at center */
                                    <ColoredMarker
                                        color="blue"
                                        sub={QUESTION_LABELS[sq.type] ?? sq.type}
                                        questionKey={-2}
                                        latitude={loc.lat}
                                        longitude={loc.lng}
                                        draggable={false}
                                        onChange={() => {}}
                                    />
                                )}
                                {/* Radius / Tentacles: show the radius circle outline */}
                                {(sq.type === "radius" || sq.type === "tentacles") &&
                                    typeof d?.radius === "number" && (
                                        <Circle
                                            center={[loc.lat, loc.lng]}
                                            radius={turf.convertLength(
                                                d.radius,
                                                d.unit ?? "miles",
                                                "meters",
                                            )}
                                            pathOptions={{
                                                color: "#2A81CB",
                                                weight: 2,
                                                fill: false,
                                                dashArray: "6 4",
                                            }}
                                        />
                                    )}
                                {/* Thermometer: two-tone dashed line (blue A→mid, red mid→B) */}
                                {hasBothPoints && (
                                    <>
                                        <Polyline
                                            positions={[
                                                [d.latA, d.lngA],
                                                [midLat, midLng],
                                            ]}
                                            pathOptions={{
                                                color: "#2A81CB",
                                                weight: 3,
                                                dashArray: "6 4",
                                            }}
                                        />
                                        <Polyline
                                            positions={[
                                                [midLat, midLng],
                                                [d.latB, d.lngB],
                                            ]}
                                            pathOptions={{
                                                color: "#CB2B3E",
                                                weight: 3,
                                                dashArray: "6 4",
                                            }}
                                        />
                                    </>
                                )}
                            </Fragment>
                        );
                    })}
            {$questions.map((question) => {
                if (!question.data) return null;
                if (!question.data.drag) return null;
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
