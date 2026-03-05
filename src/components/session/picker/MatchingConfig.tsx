/**
 * MatchingConfig — Matching question configuration screen.
 *
 * Two modes (same pattern as TentaclesConfig):
 *   "gps"    — Category dropdown + GPS-based Standort + Fragevorschau (default)
 *   "manual" — Same layout but with manual coordinate input inside the location card
 *
 * Footer GPS:    "Frage senden" · Abbrechen
 * Footer Manual: "Frage senden" · Zurück zu GPS
 */
import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { LocateFixed, MapPin, Navigation, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import { bottomSheetState, pickerOpen } from "@/lib/bottom-sheet-state";
import {
    addQuestion as addLocalQuestion,
    leafletMapContext,
    questions as questions_atom,
} from "@/lib/context";
import { addQuestion } from "@/lib/session-api";
import {
    gameSize,
    pendingDraftKey,
    sessionCode,
    sessionParticipant,
} from "@/lib/session-context";
import { locale, t, type TranslationKey } from "@/i18n";
import { ConfigCard } from "./ConfigCard";
import { PickerFooter } from "./PickerFooter";
import { PickerHeader, type WsStatus } from "./PickerHeader";

// ── Matching type definitions ────────────────────────────────────────────────

type MatchTypeDef = {
    value: string;
    /** Only for Small+Medium games (the "-full" variants) */
    smOnly?: boolean;
    /** Optgroup label for grouped types */
    group?: string;
};

const MATCH_TYPES: MatchTypeDef[] = [
    // Standard (all sizes, no group)
    { value: "airport" },
    { value: "major-city" },
    { value: "zone" },
    { value: "letter-zone" },
    // S/M full variants (no group, hidden when L)
    { value: "aquarium-full", smOnly: true },
    { value: "zoo-full", smOnly: true },
    { value: "theme_park-full", smOnly: true },
    { value: "peak-full", smOnly: true },
    { value: "museum-full", smOnly: true },
    { value: "hospital-full", smOnly: true },
    { value: "cinema-full", smOnly: true },
    { value: "library-full", smOnly: true },
    { value: "golf_course-full", smOnly: true },
    { value: "consulate-full", smOnly: true },
    { value: "park-full", smOnly: true },
    // Hiding Zone Mode — Station types
    { value: "same-first-letter-station", group: "Versteckzonen-Modus" },
    { value: "same-length-station", group: "Versteckzonen-Modus" },
    { value: "same-train-line", group: "Versteckzonen-Modus" },
    // Hiding Zone Mode — POI types
    { value: "aquarium", group: "Versteckzonen-Modus" },
    { value: "zoo", group: "Versteckzonen-Modus" },
    { value: "theme_park", group: "Versteckzonen-Modus" },
    { value: "peak", group: "Versteckzonen-Modus" },
    { value: "museum", group: "Versteckzonen-Modus" },
    { value: "hospital", group: "Versteckzonen-Modus" },
    { value: "cinema", group: "Versteckzonen-Modus" },
    { value: "library", group: "Versteckzonen-Modus" },
    { value: "golf_course", group: "Versteckzonen-Modus" },
    { value: "consulate", group: "Versteckzonen-Modus" },
    { value: "park", group: "Versteckzonen-Modus" },
];

// OSM tag mapping for "find nearest" Overpass queries
const TYPE_TO_OSM: Record<string, { key: string; value: string }> = {
    airport: { key: "aeroway", value: "aerodrome" },
    aquarium: { key: "tourism", value: "aquarium" },
    "aquarium-full": { key: "tourism", value: "aquarium" },
    zoo: { key: "tourism", value: "zoo" },
    "zoo-full": { key: "tourism", value: "zoo" },
    theme_park: { key: "tourism", value: "theme_park" },
    "theme_park-full": { key: "tourism", value: "theme_park" },
    peak: { key: "natural", value: "peak" },
    "peak-full": { key: "natural", value: "peak" },
    museum: { key: "tourism", value: "museum" },
    "museum-full": { key: "tourism", value: "museum" },
    hospital: { key: "amenity", value: "hospital" },
    "hospital-full": { key: "amenity", value: "hospital" },
    cinema: { key: "amenity", value: "cinema" },
    "cinema-full": { key: "amenity", value: "cinema" },
    library: { key: "amenity", value: "library" },
    "library-full": { key: "amenity", value: "library" },
    golf_course: { key: "leisure", value: "golf_course" },
    "golf_course-full": { key: "leisure", value: "golf_course" },
    consulate: { key: "office", value: "diplomatic" },
    "consulate-full": { key: "office", value: "diplomatic" },
    park: { key: "leisure", value: "park" },
    "park-full": { key: "leisure", value: "park" },
    "same-first-letter-station": { key: "railway", value: "station" },
    "same-length-station": { key: "railway", value: "station" },
    "same-train-line": { key: "railway", value: "station" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMatchLabel(type: string): string {
    const key = `matchType.${type}` as TranslationKey;
    return t(key, locale.get()) ?? type;
}

function formatCoord(lat: number, lng: number): string {
    const latDir = lat >= 0 ? "N" : "S";
    const lngDir = lng >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(6)}°${latDir} ${Math.abs(lng).toFixed(6)}°${lngDir}`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseClipboardCoords(text: string): { lat: number; lng: number } | null {
    const s = text.trim();
    const simple = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (simple) {
        const lat = parseFloat(simple[1]);
        const lng = parseFloat(simple[2]);
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

// ── Question preview with highlighted keywords ───────────────────────────────

function Hl({ children }: { children: React.ReactNode }) {
    return <span style={{ color: "#22C55E", fontWeight: 700 }}>{children}</span>;
}

function renderPreview(
    matchType: string,
    same: boolean,
    adminLevel: number,
): React.ReactNode {
    const label = getMatchLabel(matchType);

    if (matchType === "zone") {
        if (same) return <>Bist du in derselben <Hl>{label}</Hl> (Stufe {adminLevel}) wie ich?</>;
        return <>Bist du in einer anderen <Hl>{label}</Hl> (Stufe {adminLevel}) als ich?</>;
    }
    if (matchType === "letter-zone") {
        if (same) return <>Beginnt der Name deiner <Hl>Zone</Hl> (Stufe {adminLevel}) mit demselben Buchstaben wie meiner?</>;
        return <>Beginnt der Name deiner <Hl>Zone</Hl> (Stufe {adminLevel}) mit einem anderen Buchstaben als meiner?</>;
    }
    if (matchType === "same-first-letter-station") {
        if (same) return <>Beginnt der Name deines nächsten <Hl>Bahnhofs</Hl> mit demselben Buchstaben wie meiner?</>;
        return <>Beginnt der Name deines nächsten <Hl>Bahnhofs</Hl> mit einem anderen Buchstaben als meiner?</>;
    }
    if (matchType === "same-length-station") {
        if (same) return <>Hat der Name deines nächsten <Hl>Bahnhofs</Hl> die gleiche Länge wie meiner?</>;
        return <>Hat der Name deines nächsten <Hl>Bahnhofs</Hl> eine andere Länge als meiner?</>;
    }
    if (matchType === "same-train-line") {
        if (same) return <>Liegt dein nächster <Hl>Bahnhof</Hl> an derselben Zugstrecke wie meiner?</>;
        return <>Liegt dein nächster <Hl>Bahnhof</Hl> an einer anderen Zugstrecke als meiner?</>;
    }
    // Default: nearest X
    if (same) {
        return <>Ist die nächstgelegene <Hl>{label}</Hl> zu dir dieselbe wie die nächstgelegene <Hl>{label}</Hl> zu mir?</>;
    }
    return <>Ist die nächstgelegene <Hl>{label}</Hl> zu dir eine andere als die nächstgelegene <Hl>{label}</Hl> zu mir?</>;
}

function getInfoHint(matchType: string): string {
    const label = getMatchLabel(matchType);
    if (matchType === "zone" || matchType === "letter-zone") {
        return `Der Hider prüft, ob er in derselben ${label} ist wie du. Ein Match grenzt das Suchgebiet stark ein!`;
    }
    if (matchType.includes("station") || matchType === "same-train-line") {
        return `Der Hider vergleicht seinen nächsten Bahnhof mit deinem. Ein Match bedeutet eine starke Eingrenzung!`;
    }
    return `Der Hider vergleicht seine nächstgelegene ${label} mit deiner. Ein Match bedeutet eine starke Eingrenzung!`;
}

// ── Styles ───────────────────────────────────────────────────────────────────

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
    appearance: "none" as const,
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

const greenLink: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#22C55E",
    fontSize: "13px",
    fontWeight: 600,
    padding: 0,
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: 4,
};

// ── Main component ──────────────────────────────────────────────────────────

export interface MatchingConfigProps {
    wsStatus: WsStatus;
    onBack: () => void;
    onSettings: () => void;
    onClose: () => void;
    onDone?: () => void;
}

export function MatchingConfig({
    wsStatus,
    onBack,
    onSettings,
    onClose,
    onDone,
}: MatchingConfigProps) {
    const $gameSize = useStore(gameSize);

    const [mode, setMode] = useState<"gps" | "manual">("gps");
    const [matchType, setMatchType] = useState("airport");
    const [same, setSame] = useState(true);
    const [adminLevel, setAdminLevel] = useState(3);

    // ── Center coordinate ────────────────────────────────────────────────────
    const mapInst = leafletMapContext.get();
    const rawCenter = mapInst?.getCenter() ?? { lat: 51.1, lng: 10.4 };
    const [centerLat, setCenterLat] = useState(rawCenter.lat);
    const [centerLng, setCenterLng] = useState(rawCenter.lng);

    // ── GPS state ────────────────────────────────────────────────────────────
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsError, setGpsError] = useState<string | null>(null);

    // ── Manual state ─────────────────────────────────────────────────────────
    const [latStr, setLatStr] = useState(rawCenter.lat.toFixed(6));
    const [lngStr, setLngStr] = useState(rawCenter.lng.toFixed(6));
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<{ lat: number; lng: number; name: string }[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [coordError, setCoordError] = useState<string | null>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Find nearest state ───────────────────────────────────────────────────
    const [nearestResult, setNearestResult] = useState<{
        name: string;
        lat: number;
        lng: number;
        dist: number;
    } | null>(null);
    const [nearestLoading, setNearestLoading] = useState(false);

    // ── Submit state ─────────────────────────────────────────────────────────
    const [submitting, setSubmitting] = useState(false);

    // ── Leaflet refs ─────────────────────────────────────────────────────────
    const markerRef = useRef<L.CircleMarker | null>(null);
    const nearestMarkerRef = useRef<L.CircleMarker | null>(null);

    // ── Filter match types by game size ──────────────────────────────────────
    const filteredTypes = MATCH_TYPES.filter((mt) => {
        if ($gameSize === "L" && mt.smOnly) return false;
        return true;
    });

    const ungrouped = filteredTypes.filter((mt) => !mt.group);
    const groups = [...new Set(filteredTypes.filter((mt) => mt.group).map((mt) => mt.group!))];

    // ── Auto-fetch GPS on mount ──────────────────────────────────────────────
    useEffect(() => {
        fetchGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Draw seeker marker on map ────────────────────────────────────────────
    useEffect(() => {
        const m = leafletMapContext.get();
        if (!m) return;
        if (markerRef.current) m.removeLayer(markerRef.current);
        markerRef.current = L.circleMarker([centerLat, centerLng], {
            radius: 8,
            color: "#22C55E",
            fillColor: "#22C55E",
            fillOpacity: 0.85,
            weight: 2,
        }).addTo(m);
        m.setView([centerLat, centerLng], m.getZoom(), { animate: true });
    }, [centerLat, centerLng]);

    // ── Clean up all markers on unmount ───────────────────────────────────────
    useEffect(() => () => {
        const m = leafletMapContext.get();
        if (!m) return;
        if (markerRef.current) m.removeLayer(markerRef.current);
        if (nearestMarkerRef.current) m.removeLayer(nearestMarkerRef.current);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Clear "find nearest" result when type or position changes ─────────────
    useEffect(() => {
        setNearestResult(null);
        const m = leafletMapContext.get();
        if (nearestMarkerRef.current && m) {
            m.removeLayer(nearestMarkerRef.current);
            nearestMarkerRef.current = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchType, centerLat, centerLng]);

    // ── GPS fetch ────────────────────────────────────────────────────────────
    async function fetchGps() {
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
            setLatStr(pos.coords.latitude.toFixed(6));
            setLngStr(pos.coords.longitude.toFixed(6));
        } catch {
            setGpsError("GPS nicht verfügbar. Bitte Berechtigungen prüfen.");
        } finally {
            setGpsLoading(false);
        }
    }

    // ── Manual mode helpers ──────────────────────────────────────────────────
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
            } catch { /* ignore */ }
            finally { setSearchLoading(false); }
        }, 400);
    }

    function selectResult(r: { lat: number; lng: number }) {
        setPosition(r.lat, r.lng);
        setSearchQuery("");
        setSearchResults([]);
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

    // ── Find nearest POI via Overpass ─────────────────────────────────────────
    async function handleFindNearest() {
        const osm = TYPE_TO_OSM[matchType];
        if (!osm) return;

        setNearestLoading(true);
        setNearestResult(null);
        try {
            const radiusM = 50_000;
            const { key, value } = osm;
            const query =
                `[out:json][timeout:25];` +
                `(node["${key}"="${value}"](around:${radiusM},${centerLat},${centerLng});` +
                `way["${key}"="${value}"](around:${radiusM},${centerLat},${centerLng});` +
                `relation["${key}"="${value}"](around:${radiusM},${centerLat},${centerLng}););out center;`;

            const { overpassFetch } = await import("@/maps/api/overpass-fetch");
            const data = await overpassFetch(query, { timeoutMs: 25_000 });

            const pois = (data.elements ?? [])
                .map((el: any) => ({
                    lat: el.lat ?? el.center?.lat ?? 0,
                    lng: el.lon ?? el.center?.lon ?? 0,
                    name: el.tags?.name ?? el.tags?.["name:de"] ?? "Unbekannt",
                }))
                .filter((p: any) => p.lat !== 0);

            if (pois.length === 0) {
                toast.info("Keine Treffer im Umkreis von 50 km gefunden.");
                setNearestLoading(false);
                return;
            }

            // Find nearest by haversine
            let nearest = pois[0];
            let nearestDist = haversineKm(centerLat, centerLng, nearest.lat, nearest.lng);
            for (const p of pois) {
                const d = haversineKm(centerLat, centerLng, p.lat, p.lng);
                if (d < nearestDist) {
                    nearest = p;
                    nearestDist = d;
                }
            }

            setNearestResult({ ...nearest, dist: nearestDist });

            // Draw marker on map
            const m = leafletMapContext.get();
            if (m) {
                if (nearestMarkerRef.current) m.removeLayer(nearestMarkerRef.current);
                nearestMarkerRef.current = L.circleMarker([nearest.lat, nearest.lng], {
                    radius: 8,
                    color: "#E8323A",
                    fillColor: "#E8323A",
                    fillOpacity: 0.85,
                    weight: 2,
                }).addTo(m).bindPopup(nearest.name);
            }
        } catch {
            toast.error("Overpass-API nicht erreichbar.");
        } finally {
            setNearestLoading(false);
        }
    }

    // ── Submit ───────────────────────────────────────────────────────────────
    async function handleSubmit() {
        const code = sessionCode.get();
        const participant = sessionParticipant.get();
        if (!code || !participant) return;

        const data: Record<string, unknown> = {
            lat: centerLat,
            lng: centerLng,
            type: matchType,
            same,
        };

        // Add admin level for zone types
        if (matchType === "zone" || matchType === "letter-zone") {
            data.cat = { adminLevel };
        }

        // Add length comparison for station length type
        if (matchType === "same-length-station") {
            data.lengthComparison = "same";
        }

        setSubmitting(true);
        try {
            await addQuestion(code, participant.token, { type: "matching", data });
            addLocalQuestion({ id: "matching" as any, data });
            const added = [...questions_atom.get()].reverse().find((q) => q.id === "matching");
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

    // ── Derived ──────────────────────────────────────────────────────────────
    const canFindNearest = matchType in TYPE_TO_OSM;

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <>
            <PickerHeader
                title="Matching konfigurieren"
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
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* ── Kategorie dropdown ──────────────────────────────── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <span style={sectionLabel}>Kategorie</span>
                        <select
                            value={matchType}
                            onChange={(e) => setMatchType(e.target.value)}
                            style={selectStyle}
                        >
                            {ungrouped.map((mt) => (
                                <option key={mt.value} value={mt.value}>
                                    {getMatchLabel(mt.value)}
                                </option>
                            ))}
                            {groups.map((groupName) => (
                                <optgroup key={groupName} label={groupName}>
                                    {filteredTypes
                                        .filter((mt) => mt.group === groupName)
                                        .map((mt) => (
                                            <option key={mt.value} value={mt.value}>
                                                {getMatchLabel(mt.value)}
                                            </option>
                                        ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    {/* ── Admin level for zone types ──────────────────────── */}
                    {(matchType === "zone" || matchType === "letter-zone") && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <span style={sectionLabel}>Admin-Stufe</span>
                            <select
                                value={adminLevel}
                                onChange={(e) => setAdminLevel(parseInt(e.target.value))}
                                style={selectStyle}
                            >
                                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                        {t(`osmZone.${lvl}` as TranslationKey, locale.get()) ?? `Stufe ${lvl}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* ── Same / Different toggle ─────────────────────────── */}
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            type="button"
                            onClick={() => setSame(true)}
                            style={{
                                flex: 1,
                                padding: "8px 14px",
                                borderRadius: 999,
                                border: "none",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: 700,
                                fontFamily: "Poppins, sans-serif",
                                transition: "background 0.15s, color 0.15s",
                                background: same ? "#22C55E" : "#2A2A3A",
                                color: same ? "#fff" : "#99A1AF",
                            }}
                        >
                            ✅ Gleich
                        </button>
                        <button
                            type="button"
                            onClick={() => setSame(false)}
                            style={{
                                flex: 1,
                                padding: "8px 14px",
                                borderRadius: 999,
                                border: "none",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: 700,
                                fontFamily: "Poppins, sans-serif",
                                transition: "background 0.15s, color 0.15s",
                                background: !same ? "#E8323A" : "#2A2A3A",
                                color: !same ? "#fff" : "#99A1AF",
                            }}
                        >
                            ❌ Anders
                        </button>
                    </div>

                    {/* ── Dein Standort ────────────────────────────────────── */}
                    <ConfigCard accentColor="red">
                        {/* Card header with icon */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <LocateFixed size={18} color="#fff" />
                            <span style={{ color: "#fff", fontSize: "16px", fontWeight: 700 }}>
                                Dein Standort
                            </span>
                        </div>

                        {mode === "gps" ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <button
                                    type="button"
                                    onClick={fetchGps}
                                    disabled={gpsLoading}
                                    style={{ ...greenLink, cursor: gpsLoading ? "wait" : "pointer" }}
                                >
                                    <Navigation size={14} />
                                    {gpsLoading ? "GPS wird geladen…" : "GPS aktualisieren"}
                                </button>

                                <span style={{
                                    color: "#fff",
                                    fontSize: "14px",
                                    fontWeight: 500,
                                    fontFamily: "monospace",
                                }}>
                                    {formatCoord(centerLat, centerLng)}
                                </span>

                                {gpsError && (
                                    <span style={{ color: "#FCA5A5", fontSize: "12px" }}>{gpsError}</span>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setMode("manual")}
                                    style={greenLink}
                                >
                                    → Standort manuell eingeben
                                </button>
                            </div>
                        ) : (
                            /* ── Manual mode ──────────────────────────────── */
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
                                        <input type="number" value={latStr} onChange={(e) => applyLatStr(e.target.value)} step="0.000001" style={inputStyle} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        <label style={{ color: "#6B7280", fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}>
                                            LÄNGE
                                        </label>
                                        <input type="number" value={lngStr} onChange={(e) => applyLngStr(e.target.value)} step="0.000001" style={inputStyle} />
                                    </div>
                                </div>

                                {/* GPS + Clipboard + Back */}
                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                    <button
                                        type="button"
                                        onClick={fetchGps}
                                        disabled={gpsLoading}
                                        style={{
                                            background: "none", border: "none",
                                            cursor: gpsLoading ? "wait" : "pointer",
                                            color: "var(--color-primary)", fontSize: "12px", fontWeight: 600,
                                            padding: 0, display: "flex", alignItems: "center", gap: 4,
                                        }}
                                    >
                                        <MapPin size={12} />
                                        {gpsLoading ? "GPS…" : "GPS"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={pasteClipboard}
                                        style={{
                                            background: "none", border: "none", cursor: "pointer",
                                            color: "var(--color-primary)", fontSize: "12px", fontWeight: 600, padding: 0,
                                        }}
                                    >
                                        Aus Zwischenablage
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode("gps")}
                                        style={{
                                            background: "none", border: "none", cursor: "pointer",
                                            color: "#22C55E", fontSize: "12px", fontWeight: 600, padding: 0,
                                        }}
                                    >
                                        ← Zurück
                                    </button>
                                </div>

                                {coordError && (
                                    <span style={{ color: "#FCA5A5", fontSize: "12px" }}>{coordError}</span>
                                )}
                            </div>
                        )}
                    </ConfigCard>

                    {/* ── Fragevorschau ────────────────────────────────────── */}
                    <ConfigCard accentColor="green" title="Fragevorschau">
                        <p style={{ margin: 0, color: "#E5E7EB", fontSize: "14px", lineHeight: 1.55 }}>
                            {renderPreview(matchType, same, adminLevel)}
                        </p>
                    </ConfigCard>

                    {/* ── Find nearest button ──────────────────────────────── */}
                    {canFindNearest && (
                        <button
                            type="button"
                            onClick={handleFindNearest}
                            disabled={nearestLoading}
                            style={{
                                padding: "14px 16px",
                                borderRadius: 10,
                                border: "2px solid #22C55E",
                                background: "transparent",
                                color: "#fff",
                                fontSize: "14px",
                                fontWeight: 600,
                                fontFamily: "Poppins, sans-serif",
                                cursor: nearestLoading ? "wait" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                width: "100%",
                            }}
                        >
                            <LocateFixed size={16} color="#22C55E" />
                            {nearestLoading
                                ? "Wird gesucht…"
                                : `Zeige mir meine nächstgelegene ${getMatchLabel(matchType)}`}
                        </button>
                    )}

                    {/* Find nearest result */}
                    {nearestResult && (
                        <div style={{
                            background: "rgba(34,197,94,0.08)",
                            border: "1px solid rgba(34,197,94,0.25)",
                            borderRadius: 10,
                            padding: "12px 14px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                        }}>
                            <span style={{ color: "#22C55E", fontSize: "14px", fontWeight: 700 }}>
                                📍 {nearestResult.name}
                            </span>
                            <span style={{ color: "#99A1AF", fontSize: "12px" }}>
                                {nearestResult.dist < 1
                                    ? `${Math.round(nearestResult.dist * 1000)} m entfernt`
                                    : `${nearestResult.dist.toFixed(1)} km entfernt`}
                            </span>
                        </div>
                    )}

                    {/* ── Info hint ────────────────────────────────────────── */}
                    <div style={{
                        background: "#2A2A3A",
                        borderRadius: 10,
                        padding: "12px 14px",
                        fontSize: "13px",
                        color: "#99A1AF",
                        lineHeight: 1.5,
                    }}>
                        💡 {getInfoHint(matchType)}
                    </div>
                </div>
            </div>

            {/* ── Footer ──────────────────────────────────────────────── */}
            {mode === "gps" ? (
                <PickerFooter
                    primaryLabel={submitting ? "Wird gesendet…" : "Frage senden  ✈"}
                    primaryDisabled={submitting}
                    onPrimary={handleSubmit}
                    onCancel={onBack}
                    cancelDisabled={submitting}
                />
            ) : (
                <PickerFooter
                    primaryLabel={submitting ? "Wird gesendet…" : "Frage senden  ✈"}
                    primaryDisabled={submitting}
                    onPrimary={handleSubmit}
                    onCancel={() => setMode("gps")}
                    cancelLabel="Zurück zu GPS"
                    cancelDisabled={submitting}
                />
            )}
        </>
    );
}
