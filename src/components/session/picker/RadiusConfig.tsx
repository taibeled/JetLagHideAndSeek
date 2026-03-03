/**
 * RadiusConfig — Radar question configuration.
 *
 * Two modes (same pattern as ThermometerConfig):
 *   "gps"    — distance chips + "GPS-Tracking starten" (default)
 *   "manual" — ConfigCard (red, "Mein Standort") with CoordPicker + chips +
 *              live circle preview on the map
 *
 * Footer GPS:    "🏁 GPS-Tracking starten" · "Manuell" · Abbrechen
 * Footer Manual: "🎯 Radar starten" · Abbrechen
 */
import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { bottomSheetState, pickerOpen } from "@/lib/bottom-sheet-state";
import {
    addQuestion as addLocalQuestion,
    defaultUnit,
    leafletMapContext,
    questions as questions_atom,
} from "@/lib/context";
import { addQuestion } from "@/lib/session-api";
import { pendingDraftKey, sessionCode, sessionParticipant } from "@/lib/session-context";
import { toast } from "react-toastify";
import { ConfigCard } from "./ConfigCard";
import { PickerFooter } from "./PickerFooter";
import { PickerHeader, type WsStatus } from "./PickerHeader";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCoord(lat: number, lng: number): string {
    const latDir = lat >= 0 ? "N" : "S";
    const lngDir = lng >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

function parseClipboardCoords(text: string): { lat: number; lng: number } | null {
    const t = text.trim();
    const simple = t.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (simple) {
        const lat = parseFloat(simple[1]);
        const lng = parseFloat(simple[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    }
    const degree = t.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*[NSns]?\s+(-?\d+(?:\.\d+)?)\s*°?\s*[EWew]?$/);
    if (degree) {
        const lat = parseFloat(degree[1]);
        const lng = parseFloat(degree[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    }
    return null;
}

async function searchPhoton(query: string): Promise<{ lat: number; lng: number; name: string }[]> {
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

function toMeters(value: number, unit: "kilometers" | "miles"): number {
    return unit === "miles" ? value * 1609.34 : value * 1000;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Mode = "gps" | "manual";
type Chip = { label: string; value: number; unit: "kilometers" | "miles" };

// ── Main component ─────────────────────────────────────────────────────────────

export interface RadiusConfigProps {
    wsStatus: WsStatus;
    onBack: () => void;
    onSettings: () => void;
    onClose: () => void;
    /** Called after a question has been successfully staged, so the parent can reset to the category list. */
    onDone?: () => void;
}

export function RadiusConfig({ wsStatus, onBack, onSettings, onClose, onDone }: RadiusConfigProps) {
    const $defaultUnit = useStore(defaultUnit);
    const isMetric = $defaultUnit !== "miles";

    const [mode, setMode] = useState<Mode>("gps");
    const [submitting, setSubmitting] = useState(false);

    // GPS mode state
    const [selectedChip, setSelectedChip] = useState<Chip | null>(null);
    const [loadingGps, setLoadingGps] = useState(false);
    const [gpsError, setGpsError] = useState<string | null>(null);

    // Manual mode state — initialise from map centre
    const map = leafletMapContext.get();
    const center = map?.getCenter() ?? { lat: 51.1, lng: 10.4 };
    const [lat, setLat] = useState(center.lat);
    const [lng, setLng] = useState(center.lng);
    const [latStr, setLatStr] = useState(center.lat.toFixed(6));
    const [lngStr, setLngStr] = useState(center.lng.toFixed(6));
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<{ lat: number; lng: number; name: string }[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [manualGpsLoading, setManualGpsLoading] = useState(false);
    const [coordError, setCoordError] = useState<string | null>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Live preview circle (manual mode only)
    const circleRef = useRef<L.Circle | null>(null);

    // Distance chips
    const chips: Chip[] = isMetric
        ? [
            { label: "1 km",  value: 1,  unit: "kilometers" },
            { label: "3 km",  value: 3,  unit: "kilometers" },
            { label: "8 km",  value: 8,  unit: "kilometers" },
            { label: "25 km", value: 25, unit: "kilometers" },
            { label: "80 km", value: 80, unit: "kilometers" },
          ]
        : [
            { label: "½ mi",  value: 0.5,  unit: "miles" },
            { label: "5 mi",  value: 5,    unit: "miles" },
            { label: "15 mi", value: 15,   unit: "miles" },
            { label: "50 mi", value: 50,   unit: "miles" },
          ];

    // ── Live preview circle (manual mode) ─────────────────────────────────────

    useEffect(() => {
        if (mode !== "manual") {
            // Clean up any circle when leaving manual mode
            if (circleRef.current) {
                leafletMapContext.get()?.removeLayer(circleRef.current);
                circleRef.current = null;
            }
            return;
        }

        const currentMap = leafletMapContext.get();
        if (!currentMap) return;

        if (circleRef.current) {
            currentMap.removeLayer(circleRef.current);
            circleRef.current = null;
        }

        if (selectedChip) {
            const radiusM = toMeters(selectedChip.value, selectedChip.unit);
            const circle = L.circle([lat, lng], {
                radius: radiusM,
                color: "#E8323A",
                fillColor: "#E8323A",
                fillOpacity: 0.12,
                weight: 2,
                dashArray: "6 4",
            });
            circle.addTo(currentMap);
            circleRef.current = circle;
        }

        return () => {
            if (circleRef.current) {
                currentMap.removeLayer(circleRef.current);
                circleRef.current = null;
            }
        };
    }, [mode, lat, lng, selectedChip]);

    // ── Stage helper ───────────────────────────────────────────────────────────

    function stageRadius(centerLat: number, centerLng: number) {
        if (!selectedChip) return;
        addLocalQuestion({
            id: "radius" as any,
            data: {
                lat: centerLat,
                lng: centerLng,
                radius: selectedChip.value,
                unit: selectedChip.unit,
                within: true,
            },
        });
        const added = [...questions_atom.get()].reverse().find((q) => q.id === "radius");
        if (added) pendingDraftKey.set(added.key as number);
    }

    // ── GPS mode: start tracking ───────────────────────────────────────────────

    async function handleStartGps() {
        if (!selectedChip) return;
        setLoadingGps(true);
        setGpsError(null);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 15_000,
                }),
            );
            stageRadius(pos.coords.latitude, pos.coords.longitude);
            onDone?.();
            pickerOpen.set(false);
            bottomSheetState.set("collapsed");
        } catch {
            setLoadingGps(false);
            setGpsError("GPS nicht verfügbar. Bitte Berechtigungen prüfen.");
        }
    }

    // ── Manual mode: coord handlers ────────────────────────────────────────────

    function setPosition(newLat: number, newLng: number) {
        setLat(newLat);
        setLng(newLng);
        setLatStr(newLat.toFixed(6));
        setLngStr(newLng.toFixed(6));
    }

    function applyLatStr(s: string) {
        setLatStr(s);
        const v = parseFloat(s);
        if (!isNaN(v) && v >= -90 && v <= 90) setLat(v);
    }

    function applyLngStr(s: string) {
        setLngStr(s);
        const v = parseFloat(s);
        if (!isNaN(v) && v >= -180 && v <= 180) setLng(v);
    }

    function handleSearchChange(q: string) {
        setSearchQuery(q);
        setSearchResults([]);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (!q.trim()) return;
        searchTimeoutRef.current = setTimeout(async () => {
            setSearchLoading(true);
            try {
                setSearchResults(await searchPhoton(q));
            } catch {
                // silently ignore
            } finally {
                setSearchLoading(false);
            }
        }, 400);
    }

    function selectResult(r: { lat: number; lng: number }) {
        setPosition(r.lat, r.lng);
        setSearchQuery("");
        setSearchResults([]);
    }

    async function fetchManualGps() {
        setManualGpsLoading(true);
        setCoordError(null);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10_000,
                }),
            );
            setPosition(pos.coords.latitude, pos.coords.longitude);
        } catch {
            setCoordError("GPS nicht verfügbar");
        } finally {
            setManualGpsLoading(false);
        }
    }

    async function pasteClipboard() {
        setCoordError(null);
        try {
            const text = await navigator.clipboard.readText();
            const coords = parseClipboardCoords(text);
            if (!coords) { setCoordError("Ungültige Koordinaten"); return; }
            setPosition(coords.lat, coords.lng);
        } catch {
            setCoordError("Zwischenablage nicht verfügbar");
        }
    }

    async function handleManualStart() {
        const code = sessionCode.get();
        const participant = sessionParticipant.get();
        if (!selectedChip || !code || !participant) return;

        const data = { lat, lng, radius: selectedChip.value, unit: selectedChip.unit, within: true };
        setSubmitting(true);
        try {
            await addQuestion(code, participant.token, { type: "radius", data });
            stageRadius(lat, lng);
            pendingDraftKey.set(null);
            setSubmitting(false);
            onDone?.();
            pickerOpen.set(false);
            bottomSheetState.set("collapsed");
        } catch {
            toast.error("Server derzeit nicht erreichbar. Bitte probiere die Frage gleich nochmal zu senden.");
            setSubmitting(false);
        }
    }

    // ── Styles ─────────────────────────────────────────────────────────────────

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

    // ── Distance chip row (shared between modes) ───────────────────────────────

    const ChipRow = () => (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{
                color: "#99A1AF",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
            }}>
                Zielradius
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {chips.map((chip) => (
                    <button
                        key={chip.label}
                        type="button"
                        onClick={() => setSelectedChip(chip)}
                        style={{
                            padding: "8px 18px",
                            borderRadius: 999,
                            border: "none",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: 700,
                            fontFamily: "Poppins, sans-serif",
                            transition: "background 0.15s, color 0.15s",
                            background: selectedChip?.label === chip.label
                                ? "var(--color-primary)"
                                : "#2A2A3A",
                            color: selectedChip?.label === chip.label ? "#fff" : "#99A1AF",
                        }}
                    >
                        {chip.label}
                    </button>
                ))}
            </div>
        </div>
    );

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            <PickerHeader
                title="Radius 🎯"
                wsStatus={wsStatus}
                onBack={onBack}
                onSettings={onSettings}
                onClose={onClose}
            />

            <div style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                padding: "16px 16px 8px",
                scrollbarWidth: "thin",
                scrollbarColor: "var(--color-primary) transparent",
            }}>

                {/* ── GPS mode ───────────────────────────────────────────────── */}
                {mode === "gps" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <ChipRow />
                        {gpsError && (
                            <p style={{ color: "#FCA5A5", fontSize: "13px", margin: 0 }}>
                                {gpsError}
                            </p>
                        )}
                    </div>
                )}

                {/* ── Manual mode ────────────────────────────────────────────── */}
                {mode === "manual" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <ConfigCard accentColor="red" title="Mein Standort">
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                                <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600, fontFamily: "monospace" }}>
                                    {formatCoord(lat, lng)}
                                </span>

                                {/* Place search */}
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

                                {/* GPS + Clipboard */}
                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                    <button
                                        type="button"
                                        onClick={fetchManualGps}
                                        disabled={manualGpsLoading}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            cursor: manualGpsLoading ? "wait" : "pointer",
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
                                        {manualGpsLoading ? "GPS…" : "GPS"}
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

                                {coordError && (
                                    <span style={{ color: "#FCA5A5", fontSize: "12px" }}>{coordError}</span>
                                )}
                            </div>
                        </ConfigCard>

                        <ChipRow />
                    </div>
                )}
            </div>

            {/* ── Footer GPS ─────────────────────────────────────────────────── */}
            {mode === "gps" && (
                <PickerFooter
                    primaryLabel={loadingGps ? "GPS wird geladen…" : "🏁 GPS-Tracking starten"}
                    primaryDisabled={!selectedChip || loadingGps}
                    onPrimary={handleStartGps}
                    secondaryLabel="Manuell"
                    secondaryDisabled={loadingGps}
                    onSecondary={() => setMode("manual")}
                    onCancel={onBack}
                    cancelDisabled={loadingGps}
                />
            )}

            {/* ── Footer Manual ───────────────────────────────────────────────── */}
            {mode === "manual" && (
                <PickerFooter
                    primaryLabel={submitting ? "Wird gesendet…" : "🎯 Radar starten"}
                    primaryDisabled={!selectedChip || submitting}
                    onPrimary={handleManualStart}
                    onCancel={() => setMode("gps")}
                    cancelLabel="Zurück zu GPS"
                    cancelDisabled={submitting}
                />
            )}
        </>
    );
}
