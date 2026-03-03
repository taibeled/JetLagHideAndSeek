/**
 * ThermometerGpsLayer
 *
 * Mounted **inside** the React-Leaflet MapContainer (sibling of DraggableMarkers)
 * so it keeps running even when the sidebar Sheet is closed.
 *
 * Responsibilities:
 *  - Manage navigator.geolocation.watchPosition lifecycle
 *  - Compute travelled distance and detect stillstand / accuracy warnings
 *  - Auto-stop when target distance is reached
 *  - Render hot / cold Voronoi polygons on the map
 *  - Render a compact tracking-status overlay (top-right corner) via portal
 */
import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import { Polygon, useMap } from "react-leaflet";
import { toast } from "react-toastify";

import { questions as questionsAtom } from "@/lib/context";
import { SidebarContext } from "@/components/ui/sidebar-l-context";
import {
    pendingDraftKey,
    thermometerGpsTracking,
} from "@/lib/session-context";

// ── Voronoi helper ────────────────────────────────────────────────────────────

/**
 * Returns [coldPolygon, warmPolygon] as arrays of [lat, lng] pairs,
 * or null when the two points are identical (degenerate case).
 */
function computeVoronoi(
    latA: number, lngA: number,
    latB: number, lngB: number,
): [[number, number][], [number, number][]] | null {
    if (latA === latB && lngA === lngB) return null;
    try {
        const midLat = (latA + latB) / 2;
        const midLng = (lngA + lngB) / 2;
        const span = Math.max(
            Math.abs(latA - latB),
            Math.abs(lngA - lngB),
            0.05,
        );
        const pad = span * 3 + 1.5;
        const bbox = [
            midLng - pad, midLat - pad,
            midLng + pad, midLat + pad,
        ] as [number, number, number, number];
        const points = turf.featureCollection([
            turf.point([lngA, latA]),
            turf.point([lngB, latB]),
        ]);
        const voronoi = turf.voronoi(points, { bbox });
        if (!voronoi || voronoi.features.length < 2) return null;

        const toLatLng = (feature: any): [number, number][] =>
            (feature.geometry.coordinates[0] as [number, number][]).map(
                ([lng, lat]) => [lat, lng] as [number, number],
            );

        return [
            toLatLng(voronoi.features[0]),
            toLatLng(voronoi.features[1]),
        ];
    } catch {
        return null;
    }
}

// ── Main component ────────────────────────────────────────────────────────────

export function ThermometerGpsLayer() {
    const tracking = useStore(thermometerGpsTracking);
    const map = useMap();
    // Stable ref so the watchPosition callback always reads current tracking state
    const trackingRef = useRef(tracking);
    trackingRef.current = tracking;

    // ── watchPosition lifecycle ───────────────────────────────────────────────
    // Effect only re-runs when a NEW tracking session starts (questionKey changes),
    // not on every GPS position update.
    useEffect(() => {
        if (!tracking) return;

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const current = trackingRef.current;
                if (!current) return; // tracking was cancelled

                const { latitude, longitude, accuracy } = pos.coords;

                // Distance from start (Haversine via turf)
                const traveled = turf.distance(
                    [current.startLng, current.startLat],
                    [longitude, latitude],
                    { units: "kilometers" },
                );

                // Stillstand: consider "moved" if >5 m from last known position
                const movedM =
                    turf.distance(
                        [current.currentLng, current.currentLat],
                        [longitude, latitude],
                        { units: "kilometers" },
                    ) * 1000;
                const lastMoveTime = movedM > 5 ? Date.now() : current.lastMoveTime;

                // ── Auto-stop when target distance is reached ─────────────
                if (traveled >= current.targetKm) {
                    navigator.geolocation.clearWatch(watchId);

                    // Update the draft question with the final B coordinates.
                    // Cast through any to avoid strict union-type mismatch on data shape.
                    const qs = questionsAtom.get();
                    const updated = qs.map((q) => {
                        if (q.key !== current.questionKey) return q;
                        return {
                            ...q,
                            data: { ...(q.data as any), latB: latitude, lngB: longitude },
                        } as typeof q;
                    });
                    questionsAtom.set(updated);

                    // Clear tracking state
                    thermometerGpsTracking.set(null);

                    // Reopen sidebar
                    SidebarContext.get().setOpenMobile(true);

                    // Haptic feedback
                    navigator.vibrate?.([200, 100, 200]);

                    // Toast
                    toast.success("🎯 Thermometer-Strecke erreicht!");
                    return;
                }

                // ── Regular position update ───────────────────────────────
                thermometerGpsTracking.set({
                    ...current,
                    currentLat: latitude,
                    currentLng: longitude,
                    traveled,
                    lastMoveTime,
                    accuracy: accuracy ?? null,
                    signalLost: false,
                });
            },
            () => {
                const current = trackingRef.current;
                if (!current) return;
                thermometerGpsTracking.set({ ...current, signalLost: true });
            },
            { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
        );

        return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tracking?.questionKey]);

    if (!tracking) return null;

    const {
        startLat, startLng,
        currentLat, currentLng,
        targetKm, traveled,
        lastMoveTime, accuracy, signalLost,
    } = tracking;

    // ── Computed values ───────────────────────────────────────────────────────
    const remaining = Math.max(0, targetKm - traveled);
    const isStillstanding = Date.now() - lastMoveTime > 30_000;
    const hasAccuracyWarning = accuracy !== null && accuracy > 50;
    const voronoi = computeVoronoi(startLat, startLng, currentLat, currentLng);

    // ── Cancel handler ────────────────────────────────────────────────────────
    function handleCancel() {
        const key = pendingDraftKey.get();
        if (key !== null) {
            questionsAtom.set(questionsAtom.get().filter((q) => q.key !== key));
            pendingDraftKey.set(null);
        }
        thermometerGpsTracking.set(null);
    }

    // ── Format helpers ────────────────────────────────────────────────────────
    function fmtKm(km: number) {
        return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            {/* Hot / cold Voronoi areas */}
            {voronoi && (
                <>
                    {/* Cold area (near A = start) — dark blue */}
                    <Polygon
                        positions={voronoi[0]}
                        pathOptions={{
                            color: "#1a3a6b",
                            fillColor: "#1a3a6b",
                            fillOpacity: 0.18,
                            weight: 1,
                            opacity: 0.4,
                        }}
                    />
                    {/* Warm area (near B = current) — red */}
                    <Polygon
                        positions={voronoi[1]}
                        pathOptions={{
                            color: "#c0392b",
                            fillColor: "#c0392b",
                            fillOpacity: 0.18,
                            weight: 1,
                            opacity: 0.4,
                        }}
                    />
                </>
            )}

            {/* Tracking overlay — portalled into map container, top-right */}
            {createPortal(
                <div
                    style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        zIndex: 1000,
                        pointerEvents: "auto",
                        minWidth: 180,
                    }}
                >
                    <div
                        className="rounded-xl shadow-lg text-white text-sm"
                        style={{ backgroundColor: "rgba(6,123,194,0.93)", padding: "10px 14px" }}
                    >
                        {/* Header */}
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-base">🌡️</span>
                            <span className="font-bold tracking-wide">GPS-Thermometer</span>
                        </div>

                        {/* Status */}
                        <div className="text-xs mb-2" style={{ color: "#84BCDA" }}>
                            {signalLost ? (
                                <span className="text-yellow-300">⚠️ GPS-Signal verloren…</span>
                            ) : (
                                <span>🛰️ Tracking aktiv</span>
                            )}
                        </div>

                        {/* Cold → Warm point labels */}
                        <div className="flex justify-between text-xs mb-2">
                            <span
                                className="font-semibold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "#2A81CB", color: "#fff" }}
                            >
                                ❄️ Kalt (Start)
                            </span>
                            <span
                                className="font-semibold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "#CB2B3E", color: "#fff" }}
                            >
                                🔥 Warm (Ziel)
                            </span>
                        </div>

                        {/* Distance progress */}
                        <div className="flex flex-col gap-0.5 mb-2">
                            <div className="flex justify-between">
                                <span style={{ color: "#84BCDA" }}>Zieldistanz</span>
                                <span className="font-semibold">{fmtKm(targetKm)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: "#84BCDA" }}>Zurückgelegt</span>
                                <span className="font-semibold">{fmtKm(traveled)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: "#84BCDA" }}>Verbleibend</span>
                                <span className="font-bold" style={{ color: "#ECC30B" }}>
                                    {fmtKm(remaining)}
                                </span>
                            </div>
                        </div>

                        {/* Progress bar: blue → red gradient */}
                        <div
                            className="rounded-full mb-2 overflow-hidden"
                            style={{ height: 6, backgroundColor: "rgba(255,255,255,0.2)" }}
                        >
                            <div
                                className="rounded-full h-full"
                                style={{
                                    width: `${Math.min(100, (traveled / targetKm) * 100).toFixed(1)}%`,
                                    background: "linear-gradient(to right, #2A81CB, #CB2B3E)",
                                    transition: "width 0.5s ease",
                                }}
                            />
                        </div>

                        {/* Warnings */}
                        {isStillstanding && !signalLost && (
                            <div className="text-xs mb-1 text-yellow-300">
                                ⏸️ Kein Fortschritt seit 30 s
                            </div>
                        )}
                        {hasAccuracyWarning && (
                            <div className="text-xs mb-1 text-yellow-300">
                                📡 GPS-Genauigkeit: ±{Math.round(accuracy!)} m
                            </div>
                        )}

                        {/* Cancel */}
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="text-xs underline font-medium mt-1"
                            style={{ color: "#84BCDA" }}
                        >
                            Abbrechen
                        </button>
                    </div>
                </div>,
                map.getContainer(),
            )}
        </>
    );
}
