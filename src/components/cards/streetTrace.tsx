import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { useEffect, useRef } from "react";
import * as turf from "@turf/turf";

import { Button } from "@/components/ui/button";
import {
    hiderMode,
    leafletMapContext,
    questionModified,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import { refreshStreetTrace } from "@/maps/questions/streetTrace";
import type { StreetTraceQuestion } from "@/maps/schema";

import { QuestionCard } from "./base";
import { QuestionDebugDetails } from "./debug";

const buildTracePath = (
    coordinates: [number, number][],
    width: number,
    height: number,
    padding: number,
) => {
    if (coordinates.length < 2) {
        return "";
    }

    const projectToMercator = ([lng, lat]: [number, number]) => {
        const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
        const x = (lng * Math.PI) / 180;
        const y = Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360));
        return [x, y] as const;
    };

    const mercatorPoints = coordinates.map(projectToMercator);
    const xs = mercatorPoints.map((coord) => coord[0]);
    const ys = mercatorPoints.map((coord) => coord[1]);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const xDelta = Math.max(maxX - minX, 1e-9);
    const yDelta = Math.max(maxY - minY, 1e-9);

    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;
    const scale = Math.min(drawWidth / xDelta, drawHeight / yDelta);

    const scaledWidth = xDelta * scale;
    const scaledHeight = yDelta * scale;
    const xOffset = (drawWidth - scaledWidth) / 2;
    const yOffset = (drawHeight - scaledHeight) / 2;

    return mercatorPoints
        .map((coordinate, index) => {
            const x = padding + xOffset + (coordinate[0] - minX) * scale;
            const y = padding + yOffset + (maxY - coordinate[1]) * scale;

            const command = index === 0 ? "M" : "L";
            return `${command} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ");
};

const describeTrace = (coordinates: [number, number][]) => {
    if (coordinates.length < 2) {
        return {
            lengthMeters: 0,
            endpointDistanceMeters: 0,
        };
    }

    const lengthMeters =
        turf.length(
            turf.lineString(coordinates),
            {
                units: "kilometers",
            },
        ) * 1000;

    const endpointDistanceMeters =
        turf.distance(
            turf.point(coordinates[0]),
            turf.point(coordinates[coordinates.length - 1]),
            {
                units: "kilometers",
            },
        ) * 1000;

    return {
        lengthMeters,
        endpointDistanceMeters,
    };
};

export const StreetTraceQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: {
    data: StreetTraceQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
}) => {
    useStore(triggerLocalRefresh);
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);

    const label = `Street Trace
    ${
        $questions
            .filter((q) => q.id === "street-trace")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    const width = 320;
    const height = 140;
    const padding = 14;
    const traceCoordinates: [number, number][] =
        $hiderMode === false
            ? []
            : data.trace.map((coord) => [coord[0], coord[1]]);
    const highlightTimeoutRef = useRef<number | null>(null);
    const highlightAnimationFrameRef = useRef<number | null>(null);
    const highlightedTraceRef = useRef<string>("");
    const highlightedLayerRef = useRef<L.Polyline | null>(null);
    const tracePath = buildTracePath(
        traceCoordinates,
        width,
        height,
        padding,
    );
    const svgId = `street-trace-svg-${questionKey}`;
    const traceSignature = traceCoordinates
        .map((coord) => `${coord[0].toFixed(7)},${coord[1].toFixed(7)}`)
        .join("|");
    const traceDetails = describeTrace(traceCoordinates);

    const flashTraceOnMap = (coordinates: [number, number][]) => {
        const map = leafletMapContext.get();
        if (!map || coordinates.length < 2) {
            return;
        }

        if (highlightedLayerRef.current && map.hasLayer(highlightedLayerRef.current)) {
            map.removeLayer(highlightedLayerRef.current);
            highlightedLayerRef.current = null;
        }

        const highlightedPath = L.polyline(
            coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
            {
                color: "#ef4444",
                weight: 7,
                opacity: 0,
                interactive: false,
            },
        );

        highlightedPath.addTo(map);
        highlightedLayerRef.current = highlightedPath;

        if (highlightAnimationFrameRef.current !== null) {
            window.cancelAnimationFrame(highlightAnimationFrameRef.current);
        }

        if (highlightTimeoutRef.current !== null) {
            window.clearTimeout(highlightTimeoutRef.current);
        }

        const animationDurationMs = 10000;
        const maxOpacity = 0.9;
        const fadeDurationMs = 800;
        const animationStart = performance.now();

        const animate = (timestamp: number) => {
            const elapsed = timestamp - animationStart;
            const progress = Math.min(1, elapsed / animationDurationMs);
            let animatedOpacity = maxOpacity;

            if (elapsed < fadeDurationMs) {
                animatedOpacity = (elapsed / fadeDurationMs) * maxOpacity;
            } else if (elapsed > animationDurationMs - fadeDurationMs) {
                const fadeOutElapsed = elapsed - (animationDurationMs - fadeDurationMs);
                animatedOpacity =
                    (1 - fadeOutElapsed / fadeDurationMs) * maxOpacity;
            }

            highlightedPath.setStyle({ opacity: animatedOpacity });

            if (progress < 1) {
                highlightAnimationFrameRef.current =
                    window.requestAnimationFrame(animate);
            } else {
                highlightAnimationFrameRef.current = null;
            }
        };

        highlightAnimationFrameRef.current = window.requestAnimationFrame(animate);

        highlightTimeoutRef.current = window.setTimeout(() => {
            if (highlightedLayerRef.current && map.hasLayer(highlightedLayerRef.current)) {
                map.removeLayer(highlightedLayerRef.current);
            }
            highlightedLayerRef.current = null;
            highlightTimeoutRef.current = null;
            if (highlightAnimationFrameRef.current !== null) {
                window.cancelAnimationFrame(highlightAnimationFrameRef.current);
                highlightAnimationFrameRef.current = null;
            }
        }, animationDurationMs);
    };

    useEffect(() => {
        if ($hiderMode === false || traceCoordinates.length < 2) {
            return;
        }

        if (highlightedTraceRef.current === traceSignature) {
            return;
        }

        highlightedTraceRef.current = traceSignature;
        flashTraceOnMap(traceCoordinates);
    }, [$hiderMode, traceSignature]);

    useEffect(
        () => () => {
            if (highlightTimeoutRef.current !== null) {
                window.clearTimeout(highlightTimeoutRef.current);
                highlightTimeoutRef.current = null;
            }
            if (highlightAnimationFrameRef.current !== null) {
                window.cancelAnimationFrame(highlightAnimationFrameRef.current);
                highlightAnimationFrameRef.current = null;
            }
            const map = leafletMapContext.get();
            if (
                map &&
                highlightedLayerRef.current &&
                map.hasLayer(highlightedLayerRef.current)
            ) {
                map.removeLayer(highlightedLayerRef.current);
            }
            highlightedLayerRef.current = null;
        },
        [],
    );

    const getSerializedSvg = () => {
        const svg = document.getElementById(svgId);
        if (!(svg instanceof SVGSVGElement)) return null;

        const serializer = new XMLSerializer();
        const svgMarkup = serializer.serializeToString(svg);
        return `<?xml version="1.0" encoding="UTF-8"?>\n${svgMarkup}`;
    };

    const savePng = () => {
        const svgMarkup = getSerializedSvg();
        if (!svgMarkup) return;

        const svgBlob = new Blob([svgMarkup], {
            type: "image/svg+xml;charset=utf-8",
        });
        const svgUrl = URL.createObjectURL(svgBlob);
        const img = new Image();

        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                URL.revokeObjectURL(svgUrl);
                return;
            }

            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const pngUrl = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = pngUrl;
            link.download = `street-trace-${questionKey}.png`;
            link.click();
            URL.revokeObjectURL(svgUrl);
        };

        img.onerror = () => {
            URL.revokeObjectURL(svgUrl);
        };

        img.src = svgUrl;
    };

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            collapsed={data.collapsed}
            setCollapsed={(collapsed) => {
                data.collapsed = collapsed;
            }}
        >
            <div className="px-2 text-sm text-muted-foreground">
                {data.source === "hider"
                    ? "Tracing nearest street segment around the current hider position."
                    : "Tracing nearest street segment around this marker location."}
            </div>
            {$hiderMode === false && (
                <div className="px-2 text-sm text-red-500 font-semibold">
                    Error: Street Trace requires hider mode to be enabled.
                </div>
            )}
            <QuestionDebugDetails
                debug={(data as any).debug}
                showHider={$hiderMode !== false}
            />
            <div className="px-2 pt-2 pb-1">
                <div className="border rounded-md bg-white">
                    <svg
                        id={svgId}
                        viewBox={`0 0 ${width} ${height}`}
                        className="w-full h-auto"
                        role="img"
                        aria-label="Nearest street trace"
                    >
                        {tracePath ? (
                            <path
                                d={tracePath}
                                fill="none"
                                stroke="black"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        ) : (
                            <text
                                x={width / 2}
                                y={height / 2}
                                dominantBaseline="middle"
                                textAnchor="middle"
                                fill="#6b7280"
                                fontSize="12"
                            >
                                No nearby street/path found
                            </text>
                        )}
                    </svg>
                </div>
                <div className="pt-1 text-xs text-muted-foreground">
                    To-scale preview. Length: {Math.round(traceDetails.lengthMeters)}m,
                    end-to-end: {Math.round(traceDetails.endpointDistanceMeters)}m
                </div>
            </div>
            <div className="px-2 pb-2 flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={$hiderMode === false}
                    onClick={async () => {
                        await refreshStreetTrace(data);
                        const updatedCoordinates: [number, number][] =
                            data.trace.map((coord) => [coord[0], coord[1]]);
                        highlightedTraceRef.current = "";
                        flashTraceOnMap(updatedCoordinates);
                        questionModified();
                    }}
                >
                    Refresh Trace
                </Button>
                <Button variant="outline" size="sm" onClick={savePng}>
                    Save PNG
                </Button>
            </div>
        </QuestionCard>
    );
};
