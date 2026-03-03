/**
 * ThermometerConfig — full thermometer question configuration screen.
 *
 * Two modes, toggled in-place:
 *   "gps"    — distance chips + inline "GPS-Standort setzen" button (step 1),
 *              then "Thermometer starten" primary footer button (step 2)
 *   "manual" — two ConfigCards (Start A / End B) with coordinate input, search,
 *              GPS-fetch, clipboard-paste; direction selector (Wärmer / Kälter)
 *              shows a colored preview line on the map; "Frage absenden" submits
 */
import { useStore } from "@nanostores/react";
import { MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import * as L from "leaflet";
import * as turf from "@turf/turf";

import { useT } from "@/i18n";
import { bottomSheetState, pickerOpen } from "@/lib/bottom-sheet-state";
import {
    addQuestion as addLocalQuestion,
    defaultUnit,
    leafletMapContext,
    questions as questions_atom,
} from "@/lib/context";
import { addQuestion } from "@/lib/session-api";
import {
    pendingDraftKey,
    sessionCode,
    sessionParticipant,
    thermometerGpsTracking,
} from "@/lib/session-context";
import { toast } from "react-toastify";
import { ConfigCard } from "./ConfigCard";
import { PickerFooter } from "./PickerFooter";
import { PickerHeader, type WsStatus } from "./PickerHeader";

// ── Types ──────────────────────────────────────────────────────────────────────

type Mode = "gps" | "manual";

interface SearchResult {
    lat: number;
    lng: number;
    name: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCoord(lat: number, lng: number): string {
    const latDir = lat >= 0 ? "N" : "S";
    const lngDir = lng >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

function parseClipboardCoords(text: string): { lat: number; lng: number } | null {
    const t = text.trim();
    // "48.1234, 9.1234" or "48.1234,9.1234"
    const simple = t.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (simple) {
        const lat = parseFloat(simple[1]);
        const lng = parseFloat(simple[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    }
    // "48.1234° N 9.1234° E" or "48.1234° 9.1234°"
    const degree = t.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*[NSns]?\s+(-?\d+(?:\.\d+)?)\s*°?\s*[EWew]?$/);
    if (degree) {
        const lat = parseFloat(degree[1]);
        const lng = parseFloat(degree[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    }
    return null;
}

/**
 * Returns [coldPolygon, warmPolygon] as arrays of [lat, lng] pairs.
 * coldPolygon = Voronoi region closer to A (index 0)
 * warmPolygon = Voronoi region closer to B (index 1)
 * Returns null when A === B (degenerate case).
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

        return [toLatLng(voronoi.features[0]), toLatLng(voronoi.features[1])];
    } catch {
        return null;
    }
}

async function searchPhoton(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const resp = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
    );
    const data = await resp.json();
    return (data.features ?? []).map((f: any) => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        name: [f.properties.name, f.properties.city, f.properties.country]
            .filter(Boolean)
            .join(", "),
    }));
}

// ── CoordPicker — coordinate input block inside a ConfigCard ──────────────────

interface CoordPickerProps {
    lat: number;
    lng: number;
    onChange: (lat: number, lng: number) => void;
    label: "start" | "end";
}

function CoordPicker({ lat, lng, onChange, label }: CoordPickerProps) {
    const [latStr, setLatStr] = useState(lat.toFixed(6));
    const [lngStr, setLngStr] = useState(lng.toFixed(6));
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep input strings in sync when parent changes lat/lng (e.g. GPS updates)
    useEffect(() => { setLatStr(lat.toFixed(6)); }, [lat]);
    useEffect(() => { setLngStr(lng.toFixed(6)); }, [lng]);

    function applyLatStr(s: string) {
        setLatStr(s);
        const v = parseFloat(s);
        if (!isNaN(v) && v >= -90 && v <= 90) onChange(v, lng);
    }

    function applyLngStr(s: string) {
        setLngStr(s);
        const v = parseFloat(s);
        if (!isNaN(v) && v >= -180 && v <= 180) onChange(lat, v);
    }

    function handleSearchChange(q: string) {
        setSearchQuery(q);
        setSearchResults([]);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (!q.trim()) return;
        searchTimeoutRef.current = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const results = await searchPhoton(q);
                setSearchResults(results);
            } catch {
                // silently ignore
            } finally {
                setSearchLoading(false);
            }
        }, 400);
    }

    function selectResult(r: SearchResult) {
        onChange(r.lat, r.lng);
        setSearchQuery("");
        setSearchResults([]);
    }

    async function fetchGps() {
        setGpsLoading(true);
        setError(null);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10_000,
                }),
            );
            onChange(pos.coords.latitude, pos.coords.longitude);
        } catch {
            setError("GPS nicht verfügbar");
        } finally {
            setGpsLoading(false);
        }
    }

    async function pasteClipboard() {
        setError(null);
        try {
            const text = await navigator.clipboard.readText();
            const coords = parseClipboardCoords(text);
            if (!coords) { setError("Ungültige Koordinaten"); return; }
            onChange(coords.lat, coords.lng);
        } catch {
            setError("Zwischenablage nicht verfügbar");
        }
    }

    const inputStyle: React.CSSProperties = {
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        color: "#fff",
        fontSize: "13px",
        padding: "8px 10px",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "inherit",
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Coordinate display */}
            <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600, fontFamily: "monospace" }}>
                {formatCoord(lat, lng)}
            </span>

            {/* Search */}
            <div style={{ position: "relative" }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Search size={14} color="#6B7280" style={{ position: "absolute", left: 10, pointerEvents: "none" }} />
                    <input
                        type="text"
                        placeholder="Ort suchen…"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: 32 }}
                    />
                </div>
                {/* Search results dropdown */}
                {(searchResults.length > 0 || searchLoading) && (
                    <div style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: 4,
                        background: "#1E1E2A",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        zIndex: 10,
                        maxHeight: 180,
                        overflowY: "auto",
                    }}>
                        {searchLoading && (
                            <div style={{ padding: "10px 12px", color: "#6B7280", fontSize: "12px" }}>
                                Suche läuft…
                            </div>
                        )}
                        {searchResults.map((r, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => selectResult(r)}
                                style={{
                                    display: "block",
                                    width: "100%",
                                    textAlign: "left",
                                    background: "none",
                                    border: "none",
                                    borderBottom: i < searchResults.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                                    padding: "10px 12px",
                                    color: "#fff",
                                    fontSize: "13px",
                                    cursor: "pointer",
                                }}
                            >
                                {r.name || formatCoord(r.lat, r.lng)}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Lat / Lng inputs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ color: "#6B7280", fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}>
                        BREITE
                    </label>
                    <input
                        type="number"
                        value={latStr}
                        onChange={(e) => applyLatStr(e.target.value)}
                        step="0.000001"
                        style={inputStyle}
                    />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ color: "#6B7280", fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}>
                        LÄNGE
                    </label>
                    <input
                        type="number"
                        value={lngStr}
                        onChange={(e) => applyLngStr(e.target.value)}
                        step="0.000001"
                        style={inputStyle}
                    />
                </div>
            </div>

            {/* GPS + Clipboard links */}
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                    type="button"
                    onClick={fetchGps}
                    disabled={gpsLoading}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: gpsLoading ? "wait" : "pointer",
                        color: "var(--color-primary)",
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                    }}
                >
                    <MapPin size={12} />
                    {gpsLoading ? "GPS…" : "GPS"}
                </button>
                <button
                    type="button"
                    onClick={pasteClipboard}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--color-primary)",
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: 0,
                    }}
                >
                    Aus Zwischenablage
                </button>
            </div>

            {error && (
                <span style={{ color: "#FCA5A5", fontSize: "12px" }}>{error}</span>
            )}
        </div>
    );
}

// ── Main component ──────────────────────────────────────────────────────────────

export interface ThermometerConfigProps {
    wsStatus: WsStatus;
    onBack: () => void;
    onSettings: () => void;
    onClose: () => void;
    /** Called after a question has been successfully staged, so the parent can reset to the category list. */
    onDone?: () => void;
}

export function ThermometerConfig({ wsStatus, onBack, onSettings, onClose, onDone }: ThermometerConfigProps) {
    const tr = useT();
    const $defaultUnit = useStore(defaultUnit);
    const isMetric = $defaultUnit !== "miles";

    const [mode, setMode] = useState<Mode>("gps");
    const [submitting, setSubmitting] = useState(false);

    // GPS mode state
    const [selectedKm, setSelectedKm] = useState<number | null>(null);
    const [loadingGps, setLoadingGps] = useState(false);
    const [gpsError, setGpsError] = useState<string | null>(null);
    /** GPS-fetched start pin — set by "GPS-Standort setzen", used by "Thermometer starten" */
    const [gpsPin, setGpsPin] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);

    // Manual mode state — initialized from map center
    const map = leafletMapContext.get();
    const center = map?.getCenter() ?? { lat: 51.1, lng: 10.4 };
    const [startLat, setStartLat] = useState(center.lat);
    const [startLng, setStartLng] = useState(center.lng);
    const offsetDest = turf.destination([center.lng, center.lat], 2, 90, { units: "kilometers" });
    const [endLat, setEndLat] = useState(offsetDest.geometry.coordinates[1]);
    const [endLng, setEndLng] = useState(offsetDest.geometry.coordinates[0]);
    /** Selected travel direction: true = Wärmer (toward B), false = Kälter (away from B) */
    const [selectedWarmer, setSelectedWarmer] = useState<boolean | null>(null);

    // Leaflet layer refs
    const startMarkerRef = useRef<L.Marker | null>(null);
    const endMarkerRef = useRef<L.Marker | null>(null);
    const gpsMarkerRef = useRef<L.Marker | null>(null);
    const coldPolygonRef = useRef<L.Polygon | null>(null);
    const warmPolygonRef = useRef<L.Polygon | null>(null);

    // ── Effect: GPS pin marker (GPS mode) ────────────────────────────────────────

    useEffect(() => {
        const currentMap = leafletMapContext.get();
        if (!currentMap) return;
        if (gpsMarkerRef.current) {
            currentMap.removeLayer(gpsMarkerRef.current);
            gpsMarkerRef.current = null;
        }
        if (mode !== "gps" || !gpsPin) return;
        gpsMarkerRef.current = L.marker([gpsPin.lat, gpsPin.lng], {
            icon: L.divIcon({
                html: `<div style="width:16px;height:16px;background:#E8323A;border-radius:50%;border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,0.6)"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
                className: "",
            }),
        }).addTo(currentMap);
        return () => {
            const m = leafletMapContext.get();
            if (gpsMarkerRef.current) {
                m?.removeLayer(gpsMarkerRef.current);
                gpsMarkerRef.current = null;
            }
        };
    }, [mode, gpsPin]);

    // ── Effect: Start/End markers (manual mode) — created once per mode change ───
    // Markers are draggable; dragend updates React state.
    // Position syncing when coords change externally (search/GPS) is handled
    // by the two separate setLatLng effects below, avoiding marker recreation.

    useEffect(() => {
        const currentMap = leafletMapContext.get();
        if (!currentMap || mode !== "manual") {
            // Clean up if switching away from manual mode
            if (startMarkerRef.current) {
                leafletMapContext.get()?.removeLayer(startMarkerRef.current);
                startMarkerRef.current = null;
            }
            if (endMarkerRef.current) {
                leafletMapContext.get()?.removeLayer(endMarkerRef.current);
                endMarkerRef.current = null;
            }
            return;
        }
        const makeIcon = (color: string, label: string) =>
            L.divIcon({
                html: `<div style="width:16px;height:16px;background:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff">${label}</div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
                className: "",
            });
        // Create draggable A marker
        startMarkerRef.current = L.marker([startLat, startLng], {
            draggable: true,
            icon: makeIcon("#E8323A", "A"),
        }).addTo(currentMap);
        startMarkerRef.current.on("dragend", () => {
            const pos = startMarkerRef.current!.getLatLng();
            setStartLat(pos.lat);
            setStartLng(pos.lng);
        });
        // Create draggable B marker
        endMarkerRef.current = L.marker([endLat, endLng], {
            draggable: true,
            icon: makeIcon("#4ADE80", "B"),
        }).addTo(currentMap);
        endMarkerRef.current.on("dragend", () => {
            const pos = endMarkerRef.current!.getLatLng();
            setEndLat(pos.lat);
            setEndLng(pos.lng);
        });
        return () => {
            const m = leafletMapContext.get();
            if (startMarkerRef.current) { m?.removeLayer(startMarkerRef.current); startMarkerRef.current = null; }
            if (endMarkerRef.current)   { m?.removeLayer(endMarkerRef.current);   endMarkerRef.current   = null; }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]); // Only mode triggers recreation; coord changes use setLatLng below

    // ── Effect: Sync start marker position on external coord changes ─────────────
    // Runs when startLat/startLng change (search result, GPS, manual input, dragend).
    // After dragend the marker is already at the new position — setLatLng is a no-op.

    useEffect(() => {
        startMarkerRef.current?.setLatLng([startLat, startLng]);
    }, [startLat, startLng]);

    // ── Effect: Sync end marker position on external coord changes ───────────────

    useEffect(() => {
        endMarkerRef.current?.setLatLng([endLat, endLng]);
    }, [endLat, endLng]);

    // ── Effect: Direction preview — Voronoi half-plane polygons (manual mode) ────
    // Always shows both Voronoi half-planes (cold/warm) separated by the perpendicular
    // bisector of A–B. The selected side (Wärmer → B-side, Kälter → A-side) is
    // rendered with high opacity; the unselected side stays very dim so the
    // bisector boundary is always visible.

    useEffect(() => {
        const currentMap = leafletMapContext.get();
        if (!currentMap) return;

        // Clean up existing polygons
        if (coldPolygonRef.current) { currentMap.removeLayer(coldPolygonRef.current); coldPolygonRef.current = null; }
        if (warmPolygonRef.current) { currentMap.removeLayer(warmPolygonRef.current); warmPolygonRef.current = null; }

        if (mode !== "manual") return;

        // Compute Voronoi (same algorithm as ThermometerGpsLayer)
        const voronoi = computeVoronoi(startLat, startLng, endLat, endLng);
        if (!voronoi) return;

        const [coldCoords, warmCoords] = voronoi;

        const coldSelected  = selectedWarmer === false;
        const warmSelected  = selectedWarmer === true;
        const noneSelected  = selectedWarmer === null;

        // Cold polygon — A-side, blue
        coldPolygonRef.current = L.polygon(coldCoords, {
            color:       "#1a3a6b",
            fillColor:   "#1a3a6b",
            fillOpacity: coldSelected ? 0.35 : noneSelected ? 0.08 : 0.05,
            weight:      coldSelected ? 1.5  : 0.5,
            opacity:     coldSelected ? 0.7  : 0.2,
        }).addTo(currentMap);

        // Warm polygon — B-side, red
        warmPolygonRef.current = L.polygon(warmCoords, {
            color:       "#c0392b",
            fillColor:   "#c0392b",
            fillOpacity: warmSelected ? 0.35 : noneSelected ? 0.08 : 0.05,
            weight:      warmSelected ? 1.5  : 0.5,
            opacity:     warmSelected ? 0.7  : 0.2,
        }).addTo(currentMap);

        return () => {
            const m = leafletMapContext.get();
            if (coldPolygonRef.current) { m?.removeLayer(coldPolygonRef.current); coldPolygonRef.current = null; }
            if (warmPolygonRef.current) { m?.removeLayer(warmPolygonRef.current); warmPolygonRef.current = null; }
        };
    }, [mode, selectedWarmer, startLat, startLng, endLat, endLng]);

    // Distance chips
    const distanceChips: { label: string; km: number }[] = isMetric
        ? [
            { label: "1 km",  km: 1  },
            { label: "3 km",  km: 3  },
            { label: "8 km",  km: 8  },
            { label: "25 km", km: 25 },
            { label: "80 km", km: 80 },
          ]
        : [
            { label: "½ mi",  km: 0.80  },
            { label: "5 mi",  km: 8.05  },
            { label: "15 mi", km: 24.14 },
            { label: "50 mi", km: 80.47 },
          ];

    // ── Staging helpers ─────────────────────────────────────────────────────────

    function stageQuestionWithData(type: string, data: Record<string, unknown>) {
        addLocalQuestion({ id: type as any, data });
        const added = [...questions_atom.get()].reverse().find((q) => q.id === type);
        if (added) pendingDraftKey.set(added.key as number);
    }

    // ── GPS mode: step 1 — fetch GPS and pin location ────────────────────────────

    async function handleFetchGpsPin() {
        setLoadingGps(true);
        setGpsError(null);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 15_000,
                }),
            );
            setGpsPin({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy ?? null,
            });
        } catch {
            setGpsError("GPS nicht verfügbar. Bitte Berechtigungen prüfen.");
        } finally {
            setLoadingGps(false);
        }
    }

    // ── GPS mode: step 2 — submit question and start tracking ────────────────────

    function handleStartThermometer() {
        if (selectedKm === null || !gpsPin) return;
        const { lat, lng, accuracy } = gpsPin;
        const dest = turf.destination([lng, lat], 0.1, 90, { units: "kilometers" });
        stageQuestionWithData("thermometer", {
            latA: lat,
            lngA: lng,
            latB: dest.geometry.coordinates[1],
            lngB: dest.geometry.coordinates[0],
        });
        thermometerGpsTracking.set({
            questionKey: pendingDraftKey.get()!,
            targetKm: selectedKm,
            startLat: lat,
            startLng: lng,
            currentLat: lat,
            currentLng: lng,
            traveled: 0,
            lastMoveTime: Date.now(),
            accuracy,
            signalLost: false,
        });
        onDone?.();
        pickerOpen.set(false);
        bottomSheetState.set("collapsed");
    }

    // ── Manual mode: submit question ─────────────────────────────────────────────
    // Stage locally (for map rendering) and immediately send to server so the
    // user never sees the intermediate "Frage senden" pending card.

    async function handleManualSubmit() {
        const code = sessionCode.get();
        const participant = sessionParticipant.get();
        if (!code || !participant) return;

        const data: Record<string, unknown> = {
            latA: startLat,
            lngA: startLng,
            latB: endLat,
            lngB: endLng,
            // drag: true is required so hiderifyQuestion knows to call hiderifyThermometer
            // and compute `warmer` based on the hider's actual pin position.
            // The seeker's "Was wäre wenn" toggle is only for local map preview — not sent.
            drag: true,
        };

        // Send first — only stage locally after confirmed success (avoids duplicate
        // entries in questions_atom if the user retries after a failed send).
        setSubmitting(true);
        try {
            await addQuestion(code, participant.token, { type: "thermometer", data });
            stageQuestionWithData("thermometer", data);
            pendingDraftKey.set(null);
            setSubmitting(false);
            onDone?.();
            pickerOpen.set(false);
            bottomSheetState.set("collapsed");
        } catch {
            toast.error("Server derzeit nicht erreichbar. Bitte probiere die Frage gleich nochmal zu senden.");
            setSubmitting(false);
            // Picker stays open — user can retry immediately
        }
    }

    // ── Distance between manual points ──────────────────────────────────────────
    const manualDistKm = turf.distance([startLng, startLat], [endLng, endLat], { units: "kilometers" });
    const manualDistLabel = isMetric
        ? `${manualDistKm.toFixed(3)} km`
        : `${(manualDistKm * 0.621371).toFixed(3)} mi`;

    // ── Render ──────────────────────────────────────────────────────────────────

    return (
        <>
            <PickerHeader
                title={`${tr("questionType.thermometer" as any)} 🌡️`}
                wsStatus={wsStatus}
                onBack={onBack}
                onSettings={onSettings}
                onClose={onClose}
            />

            {/* Scrollable content */}
            <div style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                padding: "16px 16px 8px",
                scrollbarWidth: "thin",
                scrollbarColor: "var(--color-primary) transparent",
            }}>

                {/* ── GPS mode ──────────────────────────────────────────────── */}
                {mode === "gps" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                        {/* Distance chips */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <span style={{
                                color: "#99A1AF",
                                fontSize: "12px",
                                fontWeight: 600,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                            }}>
                                Zieldistanz
                            </span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                {distanceChips.map((chip) => (
                                    <button
                                        key={chip.km}
                                        type="button"
                                        onClick={() => setSelectedKm(chip.km)}
                                        style={{
                                            padding: "8px 18px",
                                            borderRadius: 999,
                                            border: "none",
                                            cursor: "pointer",
                                            fontSize: "14px",
                                            fontWeight: 700,
                                            fontFamily: "Poppins, sans-serif",
                                            transition: "background 0.15s, color 0.15s",
                                            background: selectedKm === chip.km ? "var(--color-primary)" : "#2A2A3A",
                                            color: selectedKm === chip.km ? "#fff" : "#99A1AF",
                                        }}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* GPS pin button — sets start location, not a submit */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <span style={{
                                color: "#99A1AF",
                                fontSize: "12px",
                                fontWeight: 600,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                            }}>
                                Startpunkt
                            </span>
                            <button
                                type="button"
                                onClick={handleFetchGpsPin}
                                disabled={loadingGps}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "12px 16px",
                                    background: "#2A2A3A",
                                    border: gpsPin
                                        ? "1px solid rgba(74,222,128,0.4)"
                                        : "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: 10,
                                    cursor: loadingGps ? "wait" : "pointer",
                                    color: "#fff",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    textAlign: "left",
                                    width: "100%",
                                    boxSizing: "border-box",
                                    opacity: loadingGps ? 0.6 : 1,
                                }}
                            >
                                <MapPin size={16} color={gpsPin ? "#4ADE80" : "var(--color-primary)"} style={{ flexShrink: 0 }} />
                                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                                    <span>{loadingGps ? "GPS wird geladen…" : gpsPin ? "Standort aktualisieren" : "GPS-Standort setzen"}</span>
                                    {gpsPin && (
                                        <span style={{ color: "#4ADE80", fontSize: "11px", fontWeight: 400, fontFamily: "monospace" }}>
                                            ✓ {formatCoord(gpsPin.lat, gpsPin.lng)}
                                        </span>
                                    )}
                                </div>
                            </button>
                            {gpsError && (
                                <p style={{ color: "#FCA5A5", fontSize: "13px", margin: 0 }}>
                                    {gpsError}
                                </p>
                            )}
                        </div>

                    </div>
                )}

                {/* ── Manual mode ───────────────────────────────────────────── */}
                {mode === "manual" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <ConfigCard accentColor="red" title="Start (A)">
                            <CoordPicker
                                lat={startLat}
                                lng={startLng}
                                onChange={(lat, lng) => { setStartLat(lat); setStartLng(lng); }}
                                label="start"
                            />
                        </ConfigCard>

                        <ConfigCard accentColor="green" title="Ende (B)">
                            <CoordPicker
                                lat={endLat}
                                lng={endLng}
                                onChange={(lat, lng) => { setEndLat(lat); setEndLng(lng); }}
                                label="end"
                            />
                        </ConfigCard>

                        {/* Direction preview — optional "what if" map preview, not required for submit */}
                        <ConfigCard accentColor="yellow" title="Was wäre wenn …">
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <span style={{ color: "#99A1AF", fontSize: "12px", lineHeight: 1.4 }}>
                                    Hier könnt ihr schauen, wie eure Karte aussehen würde, wenn der Hider näher an Punkt A oder an Punkt B wäre.
                                </span>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedWarmer(true)}
                                        style={{
                                            flex: 1,
                                            padding: "10px 8px",
                                            borderRadius: 8,
                                            border: selectedWarmer === true
                                                ? "2px solid #F97316"
                                                : "2px solid rgba(255,255,255,0.08)",
                                            background: selectedWarmer === true
                                                ? "rgba(249,115,22,0.15)"
                                                : "rgba(255,255,255,0.04)",
                                            color: selectedWarmer === true ? "#F97316" : "#99A1AF",
                                            cursor: "pointer",
                                            fontSize: "14px",
                                            fontWeight: 700,
                                            fontFamily: "Poppins, sans-serif",
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        🔥 Wärmer
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedWarmer(false)}
                                        style={{
                                            flex: 1,
                                            padding: "10px 8px",
                                            borderRadius: 8,
                                            border: selectedWarmer === false
                                                ? "2px solid #60A5FA"
                                                : "2px solid rgba(255,255,255,0.08)",
                                            background: selectedWarmer === false
                                                ? "rgba(96,165,250,0.15)"
                                                : "rgba(255,255,255,0.04)",
                                            color: selectedWarmer === false ? "#60A5FA" : "#99A1AF",
                                            cursor: "pointer",
                                            fontSize: "14px",
                                            fontWeight: 700,
                                            fontFamily: "Poppins, sans-serif",
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        ❄️ Kälter
                                    </button>
                                </div>
                            </div>
                        </ConfigCard>
                    </div>
                )}
            </div>

            {/* ── Footer GPS ──────────────────────────────────────────────── */}
            {mode === "gps" && (
                <PickerFooter
                    primaryLabel="🏁 Thermometer starten"
                    primaryDisabled={selectedKm === null || gpsPin === null}
                    onPrimary={handleStartThermometer}
                    secondaryLabel="Manuell"
                    secondaryDisabled={loadingGps}
                    onSecondary={() => setMode("manual")}
                    onCancel={onBack}
                    cancelDisabled={loadingGps}
                />
            )}

            {/* ── Footer Manual ────────────────────────────────────────────── */}
            {mode === "manual" && (
                <PickerFooter
                    primaryLabel={submitting ? "Wird gesendet…" : "Frage absenden"}
                    primaryDisabled={submitting}
                    onPrimary={handleManualSubmit}
                    onCancel={() => setMode("gps")}
                    cancelLabel="Zurück zu GPS"
                    cancelDisabled={submitting}
                    note={`Entfernung: ${manualDistLabel}`}
                />
            )}
        </>
    );
}
