/**
 * TentaclesConfig — Tentacle question configuration screen.
 *
 * Two modes (same pattern as RadiusConfig):
 *   "gps"    — Category dropdown + distance chips + "GPS-Standort setzen" (default)
 *   "manual" — ConfigCard (red, "Mein Standort") with CoordPicker + category + chips
 *
 * Live map preview: radius circle + POI pins from Overpass API
 * Footer GPS:    "Frage stellen" · "Manuell" · Abbrechen
 * Footer Manual: "Frage stellen" · Abbrechen (= Zurück zu GPS)
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

// ── Category definitions ───────────────────────────────────────────────────────

type Category = {
    type: string;
    label: string;
    osm: { key: string; value: string };
};

const CATEGORIES: Category[] = [
    { type: "hospital",   label: "Krankenhäuser", osm: { key: "amenity", value: "hospital"   } },
    { type: "museum",     label: "Museen",         osm: { key: "tourism", value: "museum"     } },
    { type: "zoo",        label: "Zoos",           osm: { key: "tourism", value: "zoo"        } },
    { type: "aquarium",   label: "Aquarien",       osm: { key: "tourism", value: "aquarium"   } },
    { type: "cinema",     label: "Kinos",          osm: { key: "amenity", value: "cinema"     } },
    { type: "library",    label: "Bibliotheken",   osm: { key: "amenity", value: "library"    } },
    { type: "theme_park", label: "Freizeitparks",  osm: { key: "tourism", value: "theme_park" } },
];

// ── Types ──────────────────────────────────────────────────────────────────────

type Mode = "gps" | "manual";
type Chip = { label: string; value: number; unit: "kilometers" | "miles" };
type FetchState = "idle" | "loading" | "done" | "error";
type Poi = { lat: number; lng: number; name: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function toMeters(value: number, unit: "kilometers" | "miles"): number {
    return unit === "miles" ? value * 1609.34 : value * 1000;
}

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

async function fetchOverpassPois(
    lat: number,
    lng: number,
    radiusM: number,
    cat: Category,
    signal: AbortSignal,
): Promise<Poi[]> {
    const { key, value } = cat.osm;
    const r = Math.round(radiusM);
    const query =
        `[out:json][timeout:25];` +
        `(node["${key}"="${value}"](around:${r},${lat},${lng});` +
        `way["${key}"="${value}"](around:${r},${lat},${lng});` +
        `relation["${key}"="${value}"](around:${r},${lat},${lng}););out center;`;

    const { overpassFetch } = await import("@/maps/api/overpass-fetch");
    const data = await overpassFetch(query, { timeoutMs: 25_000, signal });

    return (data.elements ?? [])
        .map((el: any) => ({
            lat: el.lat ?? el.center?.lat ?? 0,
            lng: el.lon ?? el.center?.lon ?? 0,
            name: el.tags?.name ?? el.tags?.["name:de"] ?? "",
        }))
        .filter((p: Poi) => p.lat !== 0);
}

// ── Main component ─────────────────────────────────────────────────────────────

export interface TentaclesConfigProps {
    wsStatus: WsStatus;
    onBack: () => void;
    onSettings: () => void;
    onClose: () => void;
    onDone?: () => void;
}

export function TentaclesConfig({ wsStatus, onBack, onSettings, onClose, onDone }: TentaclesConfigProps) {
    const $defaultUnit = useStore(defaultUnit);
    const isMetric = $defaultUnit !== "miles";

    const [mode, setMode] = useState<Mode>("gps");

    // ── Center coordinate (reactive — GPS or manual can update) ─────────────
    const mapInst = leafletMapContext.get();
    const rawCenter = mapInst?.getCenter() ?? { lat: 51.1, lng: 10.4 };
    const [centerLat, setCenterLat] = useState(rawCenter.lat);
    const [centerLng, setCenterLng] = useState(rawCenter.lng);

    // ── GPS mode state ──────────────────────────────────────────────────────
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsError, setGpsError] = useState<string | null>(null);

    // ── Manual mode state ───────────────────────────────────────────────────
    const [latStr, setLatStr] = useState(rawCenter.lat.toFixed(6));
    const [lngStr, setLngStr] = useState(rawCenter.lng.toFixed(6));
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<{ lat: number; lng: number; name: string }[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [manualGpsLoading, setManualGpsLoading] = useState(false);
    const [coordError, setCoordError] = useState<string | null>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Shared state ────────────────────────────────────────────────────────
    const [category, setCategory] = useState<string>("hospital");
    const [selectedChip, setSelectedChip] = useState<Chip | null>(null);
    const [pois, setPois] = useState<Poi[]>([]);
    const [fetchState, setFetchState] = useState<FetchState>("idle");
    const [submitting, setSubmitting] = useState(false);

    // Leaflet layer refs
    const circleRef = useRef<L.Circle | null>(null);
    const markersRef = useRef<L.CircleMarker[]>([]);

    // Distance chips
    const chips: Chip[] = isMetric
        ? [
            { label: "1 km",  value: 1,  unit: "kilometers" },
            { label: "3 km",  value: 3,  unit: "kilometers" },
            { label: "8 km",  value: 8,  unit: "kilometers" },
            { label: "25 km", value: 25, unit: "kilometers" },
          ]
        : [
            { label: "½ mi", value: 0.5, unit: "miles" },
            { label: "2 mi", value: 2,   unit: "miles" },
            { label: "5 mi", value: 5,   unit: "miles" },
            { label: "15 mi", value: 15, unit: "miles" },
          ];

    const selectedCategory = CATEGORIES.find((c) => c.type === category) ?? CATEGORIES[0];

    // ── Map layer helpers ──────────────────────────────────────────────────────

    function clearMapLayers() {
        const m = leafletMapContext.get();
        if (!m) return;
        if (circleRef.current) { m.removeLayer(circleRef.current); circleRef.current = null; }
        markersRef.current.forEach((mk) => m.removeLayer(mk));
        markersRef.current = [];
    }

    function drawCircle(radiusM: number) {
        const m = leafletMapContext.get();
        if (!m) return;
        if (circleRef.current) m.removeLayer(circleRef.current);
        circleRef.current = L.circle([centerLat, centerLng], {
            radius: radiusM,
            color: "#E8323A",
            fillColor: "#E8323A",
            fillOpacity: 0.08,
            weight: 2,
            dashArray: "6 4",
        }).addTo(m);
    }

    function drawMarkers(poisList: Poi[]) {
        const m = leafletMapContext.get();
        if (!m) return;
        markersRef.current.forEach((mk) => m.removeLayer(mk));
        markersRef.current = poisList.map((poi) =>
            L.circleMarker([poi.lat, poi.lng], {
                radius: 6,
                color: "#E8323A",
                fillColor: "#E8323A",
                fillOpacity: 0.85,
                weight: 1.5,
            }).addTo(m),
        );
    }

    // ── Fetch POIs when category, chip, or center changes ──────────────────

    useEffect(() => {
        if (!selectedChip) {
            clearMapLayers();
            setPois([]);
            setFetchState("idle");
            return;
        }

        const radiusM = toMeters(selectedChip.value, selectedChip.unit);
        drawCircle(radiusM);
        setPois([]);
        setFetchState("loading");

        const controller = new AbortController();

        fetchOverpassPois(centerLat, centerLng, radiusM, selectedCategory, controller.signal)
            .then((results) => {
                setPois(results);
                drawMarkers(results);
                setFetchState("done");
            })
            .catch((err) => {
                if (!controller.signal.aborted) setFetchState("error");
            });

        return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, selectedChip, centerLat, centerLng]);

    // Cleanup all map layers on unmount
    useEffect(() => () => { clearMapLayers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── GPS: fetch current position ─────────────────────────────────────────

    async function handleFetchGps() {
        setGpsLoading(true);
        setGpsError(null);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 15_000,
                }),
            );
            setCenterLat(pos.coords.latitude);
            setCenterLng(pos.coords.longitude);
        } catch {
            setGpsError("GPS nicht verfügbar. Bitte Berechtigungen prüfen.");
        } finally {
            setGpsLoading(false);
        }
    }

    // ── Manual mode: coord handlers ─────────────────────────────────────────

    function setPosition(newLat: number, newLng: number) {
        setCenterLat(newLat);
        setCenterLng(newLng);
        setLatStr(newLat.toFixed(6));
        setLngStr(newLng.toFixed(6));
    }

    function applyLatStr(s: string) {
        setLatStr(s);
        const v = parseFloat(s);
        if (!isNaN(v) && v >= -90 && v <= 90) setCenterLat(v);
    }

    function applyLngStr(s: string) {
        setLngStr(s);
        const v = parseFloat(s);
        if (!isNaN(v) && v >= -180 && v <= 180) setCenterLng(v);
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

    // ── Submit ──────────────────────────────────────────────────────────────

    async function handleSubmit() {
        const code = sessionCode.get();
        const participant = sessionParticipant.get();
        if (!selectedChip || !code || !participant) return;

        const data = {
            lat: centerLat,
            lng: centerLng,
            radius: selectedChip.value,
            unit: selectedChip.unit,
            locationType: category,
            location: false,
        };
        setSubmitting(true);
        try {
            await addQuestion(code, participant.token, { type: "tentacles", data });
            addLocalQuestion({ id: "tentacles" as any, data });
            const added = [...questions_atom.get()].reverse().find((q) => q.id === "tentacles");
            if (added) pendingDraftKey.set(added.key as number);
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

    // ── Footer note ────────────────────────────────────────────────────────────

    function getFooterNote(): string | undefined {
        if (!selectedChip) return undefined;
        if (fetchState === "loading") return "POIs werden geladen…";
        if (fetchState === "error")   return "Overpass-API nicht erreichbar — bitte erneut versuchen";
        if (fetchState === "done") {
            return pois.length === 0
                ? `Keine ${selectedCategory.label} in diesem Radius`
                : `${pois.length} ${selectedCategory.label} im Radius gefunden`;
        }
        return undefined;
    }

    // ── Styles ─────────────────────────────────────────────────────────────────

    const selectStyle: React.CSSProperties = {
        background: "#1E1E2A",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        color: "#fff",
        fontSize: "15px",
        fontWeight: 600,
        padding: "12px 40px 12px 14px",
        width: "100%",
        outline: "none",
        appearance: "none" as any,
        fontFamily: "inherit",
        backgroundImage:
            `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' viewBox='0 0 12 7'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B7280' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 14px center",
        cursor: "pointer",
    };

    const sectionLabel: React.CSSProperties = {
        color: "#99A1AF",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
    };

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

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            <PickerHeader
                title="Tentakel 🦑"
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
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* ── GPS mode: location button ──────────────────────── */}
                    {mode === "gps" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <span style={sectionLabel}>Standort</span>
                            <button
                                type="button"
                                onClick={handleFetchGps}
                                disabled={gpsLoading}
                                style={{
                                    padding: "12px 16px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    cursor: gpsLoading ? "wait" : "pointer",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    fontFamily: "Poppins, sans-serif",
                                    background: "#1E1E2A",
                                    color: "#fff",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    width: "100%",
                                    textAlign: "left",
                                }}
                            >
                                <MapPin size={16} color="var(--color-primary)" />
                                {gpsLoading ? "GPS wird geladen…" : `📍 GPS-Standort setzen`}
                            </button>
                            <span style={{ color: "#6B7280", fontSize: "12px" }}>
                                Aktuell: {formatCoord(centerLat, centerLng)}
                            </span>
                            {gpsError && (
                                <span style={{ color: "#FCA5A5", fontSize: "12px" }}>{gpsError}</span>
                            )}
                        </div>
                    )}

                    {/* ── Manual mode: coordinate input ──────────────────── */}
                    {mode === "manual" && (
                        <ConfigCard accentColor="red" title="Mein Standort">
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                                <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600, fontFamily: "monospace" }}>
                                    {formatCoord(centerLat, centerLng)}
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
                    )}

                    {/* ── Category dropdown ──────────────────────────────── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <span style={sectionLabel}>Ortstyp</span>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            style={selectStyle}
                        >
                            {CATEGORIES.map((c) => (
                                <option key={c.type} value={c.type}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* ── Radius chips ───────────────────────────────────── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <span style={sectionLabel}>Suchradius</span>
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

                    {/* ── Question preview card ──────────────────────────── */}
                    {selectedChip && (
                        <ConfigCard accentColor="red" title="Fragevorschau">
                            <p style={{ margin: 0, color: "#E5E7EB", fontSize: "14px", lineHeight: 1.55 }}>
                                Von allen{" "}
                                <span style={{ color: "#E8323A", fontWeight: 700 }}>
                                    {selectedCategory.label}
                                </span>{" "}
                                innerhalb von{" "}
                                <span style={{ color: "#E8323A", fontWeight: 700 }}>
                                    {selectedChip.label}
                                </span>{" "}
                                um mich herum, welchem bist du am nächsten?
                            </p>
                        </ConfigCard>
                    )}
                </div>
            </div>

            {/* ── Footer GPS ─────────────────────────────────────────────── */}
            {mode === "gps" && (
                <PickerFooter
                    primaryLabel={submitting ? "Wird gesendet…" : "Frage stellen"}
                    primaryDisabled={!selectedChip || fetchState === "loading" || submitting}
                    onPrimary={handleSubmit}
                    secondaryLabel="Manuell"
                    secondaryDisabled={submitting}
                    onSecondary={() => setMode("manual")}
                    onCancel={onBack}
                    cancelDisabled={submitting}
                    note={getFooterNote()}
                />
            )}

            {/* ── Footer Manual ───────────────────────────────────────────── */}
            {mode === "manual" && (
                <PickerFooter
                    primaryLabel={submitting ? "Wird gesendet…" : "Frage stellen"}
                    primaryDisabled={!selectedChip || fetchState === "loading" || submitting}
                    onPrimary={handleSubmit}
                    onCancel={() => setMode("gps")}
                    cancelLabel="Zurück zu GPS"
                    cancelDisabled={submitting}
                    note={getFooterNote()}
                />
            )}
        </>
    );
}
