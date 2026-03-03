/**
 * TentaclesConfig — Tentacle question configuration screen.
 *
 * - Dropdown: Ortstyp (Zoo / Aquarium / Museum / Krankenhaus etc.)
 * - Radius chips: 1 · 3 · 8 · 25 km (tentacles-specific smaller values)
 * - Live map preview: radius circle + POI pins from Overpass API
 * - Footer: POI count note · "Frage stellen" · Abbrechen
 */
import { useStore } from "@nanostores/react";
import * as L from "leaflet";
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
// Only types supported by tentacleQuestionSchema (Fifteen + One sub-schemas).

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

type Chip = { label: string; value: number; unit: "kilometers" | "miles" };
type FetchState = "idle" | "loading" | "done" | "error";
type Poi = { lat: number; lng: number; name: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function toMeters(value: number, unit: "kilometers" | "miles"): number {
    return unit === "miles" ? value * 1609.34 : value * 1000;
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
        `[out:json][timeout:15];` +
        `(node["${key}"="${value}"](around:${r},${lat},${lng});` +
        `way["${key}"="${value}"](around:${r},${lat},${lng});` +
        `relation["${key}"="${value}"](around:${r},${lat},${lng}););out center;`;

    const resp = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
        { signal },
    );
    const data = await resp.json();

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
    /** Called after a question has been successfully staged, so the parent can reset to the category list. */
    onDone?: () => void;
}

export function TentaclesConfig({ wsStatus, onBack, onSettings, onClose, onDone }: TentaclesConfigProps) {
    const $defaultUnit = useStore(defaultUnit);
    const isMetric = $defaultUnit !== "miles";

    // Seeker center — fixed at component mount (map centre)
    const mapInst = leafletMapContext.get();
    const rawCenter = mapInst?.getCenter() ?? { lat: 51.1, lng: 10.4 };
    const centerRef = useRef({ lat: rawCenter.lat, lng: rawCenter.lng });
    const { lat: centerLat, lng: centerLng } = centerRef.current;

    const [category, setCategory] = useState<string>("hospital");
    const [selectedChip, setSelectedChip] = useState<Chip | null>(null);
    const [pois, setPois] = useState<Poi[]>([]);
    const [fetchState, setFetchState] = useState<FetchState>("idle");
    const [submitting, setSubmitting] = useState(false);

    // Leaflet layer refs (imperatively managed)
    const circleRef = useRef<L.Circle | null>(null);
    const markersRef = useRef<L.CircleMarker[]>([]);

    // Distance chips — tentacles uses smaller values than radius/thermometer
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

    // ── Fetch POIs when category or chip changes ───────────────────────────────

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
    }, [category, selectedChip]);

    // Cleanup all map layers on unmount
    useEffect(() => () => { clearMapLayers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Stage and submit ───────────────────────────────────────────────────────

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
            // Stage locally only after confirmed send
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
        if (fetchState === "error")   return "Overpass-API nicht erreichbar";
        if (fetchState === "done") {
            return pois.length === 0
                ? `Keine ${selectedCategory.label} in diesem Radius`
                : `${pois.length} ${selectedCategory.label} im Radius gefunden`;
        }
        return undefined;
    }

    // ── Render ─────────────────────────────────────────────────────────────────

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

            <PickerFooter
                primaryLabel={submitting ? "Wird gesendet…" : "Frage stellen"}
                primaryDisabled={!selectedChip || fetchState === "loading" || submitting}
                onPrimary={handleSubmit}
                onCancel={onBack}
                cancelDisabled={submitting}
                note={getFooterNote()}
            />
        </>
    );
}
