/**
 * Shown inside the sidebar when a multiplayer session is active.
 *
 * - SEEKER: sees a "Frage stellen" button + list of pending/answered questions
 * - HIDER:  sees pending questions with a two-step answer flow:
 *             1. Click "Antworten" → enters preview mode
 *             2. Position the green pin (GPS or drag on map)
 *             3. See live preview of the result
 *             4. Click "Antwort senden" to actually submit
 */
import { useStore } from "@nanostores/react";
import { CheckCircle, ChevronDown, Clock, MapPin, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import * as L from "leaflet";
import * as turf from "@turf/turf";

import { Button } from "@/components/ui/button";
import {
    MatchingQuestionComponent,
    MeasuringQuestionComponent,
    RadiusQuestionComponent,
    TentacleQuestionComponent,
    ThermometerQuestionComponent,
} from "@/components/QuestionCards";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    addQuestion as addLocalQuestion,
    hiderMode,
    isLoading,
    leafletMapContext,
    questions as questions_atom,
} from "@/lib/context";
import { SidebarContext } from "@/components/ui/sidebar-l-context";
import { hiderifyQuestion } from "@/maps";
import { addQuestion, answerQuestion } from "@/lib/session-api";
import {
    pendingDraftKey,
    sessionCode,
    sessionParticipant,
    sessionQuestions,
    thermometerGpsTracking,
} from "@/lib/session-context";
import { pendingPickerType, pickerOpen } from "@/lib/bottom-sheet-state";
import type { SessionQuestion } from "@hideandseek/shared";
import { locale, t, useT, type TranslationKey } from "@/i18n";

// ── Voronoi helper for thermometer answer overlay ──────────────────────────────

/**
 * Returns [coldPolygon, warmPolygon] as [lat,lng][] arrays representing the
 * two Voronoi half-planes separated by the perpendicular bisector of A–B.
 * coldPolygon = region closer to A (index 0), warmPolygon = region closer to B (index 1).
 * Returns null when A === B (degenerate case).
 */
function computeThermometerVoronoi(
    latA: number, lngA: number,
    latB: number, lngB: number,
): [[number, number][], [number, number][]] | null {
    if (latA === latB && lngA === lngB) return null;
    try {
        const midLat = (latA + latB) / 2;
        const midLng = (lngA + lngB) / 2;
        const span = Math.max(Math.abs(latA - latB), Math.abs(lngA - lngB), 0.05);
        const pad = span * 3 + 1.5;
        const bbox = [midLng - pad, midLat - pad, midLng + pad, midLat + pad] as [number, number, number, number];
        const pts = turf.featureCollection([turf.point([lngA, latA]), turf.point([lngB, latB])]);
        const voronoi = turf.voronoi(pts, { bbox });
        if (!voronoi || voronoi.features.length < 2) return null;
        const toLatLng = (f: any): [number, number][] =>
            (f.geometry.coordinates[0] as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]);
        return [toLatLng(voronoi.features[0]), toLatLng(voronoi.features[1])];
    } catch {
        return null;
    }
}

// ── Lateness helper ───────────────────────────────────────────────────────────

/**
 * Returns a human-readable "X min zu spät" / "Xs zu spät" string.
 * `ms` must be > 0.
 */
function formatLateness(ms: number): string {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s zu spät`;
    const mins = Math.round(secs / 60);
    return `${mins} min zu spät`;
}

// ── Translation-backed label helpers ─────────────────────────────────────────

function getQuestionLabel(type: string): string {
    const key = `questionType.${type}` as TranslationKey;
    return t(key, locale.get()) ?? type;
}

function getLocTypeLabel(type: string): string {
    const key = `locType.${type}` as TranslationKey;
    return t(key, locale.get()) ?? type;
}

function getMeasTypeLabel(type: string): string {
    const key = `measType.${type}` as TranslationKey;
    return t(key, locale.get()) ?? type;
}

function getMatchTypeLabel(type: string): string {
    const key = `matchType.${type}` as TranslationKey;
    return t(key, locale.get()) ?? type;
}

function getUnitLabel(unit: string): string {
    const key = `unit.${unit}` as TranslationKey;
    return t(key, locale.get()) ?? unit;
}

// ── Kurztext-Beschreibung je Fragetyp ─────────────────────────────────────────

function describeQuestion(
    type: string,
    data: any,
    answerData?: any,
): string | null {
    if (!data) return null;
    const loc = locale.get();
    switch (type) {
        case "radius": {
            const dir = data.within === false ? t("sqp.descOutside", loc) : t("sqp.descInside", loc);
            const unit = getUnitLabel(data.unit ?? "");
            if (typeof data.lat === "number" && typeof data.lng === "number") {
                return `${dir} ${data.radius} ${unit} von ${data.lat.toFixed(4)}°N, ${data.lng.toFixed(4)}°E`;
            }
            return `${dir} ${data.radius} ${unit}`;
        }
        case "thermometer": {
            const dir = data.warmer === false ? t("sqp.descColder", loc) : t("sqp.descWarmer", loc);
            return `${dir} ${t("sqp.descThan", loc)}`;
        }
        case "tentacles": {
            const locLabel = getLocTypeLabel(data.locationType ?? "");
            const unit = getUnitLabel(data.unit ?? "");
            const answeredName =
                answerData?.location?.properties?.name ??
                answerData?.location?.properties?.display_name ??
                null;
            if (answeredName) {
                return `${locLabel}: ${answeredName}`;
            }
            if (answerData && answerData.location === false) {
                return `${locLabel}: ${t("sqp.descNoLocation", loc)}`;
            }
            return `${t("sqp.descNearest", loc)} ${locLabel} (${data.radius} ${unit})`;
        }
        case "matching": {
            const dir = data.same === false ? t("sqp.descOther", loc) : t("sqp.descSame", loc);
            const typeLabel = getMatchTypeLabel(data.type ?? "");
            return `${dir} ${typeLabel}`;
        }
        case "measuring": {
            const dir =
                data.hiderCloser === false
                    ? t("sqp.descSeekerCloser", loc)
                    : t("sqp.descHiderCloser", loc);
            const typeLabel = getMeasTypeLabel(data.type ?? "");
            return `${dir} ${typeLabel}`;
        }
        default:
            return null;
    }
}

// ── Strukturierte Detail-Chips (aufgeklappt) ──────────────────────────────────

function QuestionDetails({
    sq,
    answered = false,
}: {
    sq: { type: string; data: unknown; status: string; answerData?: unknown };
    answered?: boolean;
}) {
    const d = sq.data as any;
    const a = sq.answerData as any;
    if (!d) return null;

    const rows: { icon: string; text: string }[] = [];

    // Koordinaten (Hauptpunkt)
    if (typeof d.lat === "number" && typeof d.lng === "number") {
        rows.push({
            icon: "📍",
            text: `${d.lat.toFixed(4)}° N, ${d.lng.toFixed(4)}° E`,
        });
    }
    const loc = locale.get();
    // Thermometer: zwei Punkte
    if (sq.type === "thermometer") {
        if (typeof d.latA === "number") {
            rows.push({
                icon: "🅰️",
                text: `${t("sqp.detailPunktA", loc)} ${d.latA.toFixed(4)}° N, ${d.lngA.toFixed(4)}° E`,
            });
        }
        if (typeof d.latB === "number") {
            rows.push({
                icon: "🅱️",
                text: `${t("sqp.detailPunktB", loc)} ${d.latB.toFixed(4)}° N, ${d.lngB.toFixed(4)}° E`,
            });
        }
    }
    // Radius
    if (typeof d.radius === "number" && sq.type !== "thermometer") {
        const unit = getUnitLabel(d.unit ?? "");
        rows.push({ icon: "⭕", text: `${t("sqp.detailRadius", loc)} ${d.radius} ${unit}` });
    }
    // Standorttyp (tentacles)
    if (sq.type === "tentacles" && d.locationType) {
        const label = getLocTypeLabel(d.locationType);
        rows.push({ icon: "🏛️", text: `${t("sqp.detailStandorttyp", loc)} ${label}` });
    }
    // Sub-Typ (matching / measuring)
    if ((sq.type === "matching" || sq.type === "measuring") && d.type) {
        const label =
            sq.type === "matching"
                ? getMatchTypeLabel(d.type)
                : getMeasTypeLabel(d.type);
        rows.push({ icon: "🔎", text: `${t("sqp.detailTyp", loc)} ${label}` });
        // Admin-Level bei Zone
        if (d.cat?.adminLevel != null) {
            rows.push({
                icon: "🗺️",
                text: `${t("sqp.detailVerwaltungsebene", loc)} ${d.cat.adminLevel}`,
            });
        }
    }

    // ── Antwort des Hiders (answerData) ──────────────────────────────────────
    if (sq.status === "answered" && a) {
        if (sq.type === "tentacles") {
            const locName =
                a.location?.properties?.name ??
                a.location?.properties?.display_name ??
                null;
            if (locName) {
                rows.push({ icon: "✅", text: `${t("sqp.detailAntwort", loc)} ${locName}` });
            } else if (a.location === false) {
                rows.push({ icon: "❌", text: t("sqp.detailKeinStandort", loc) });
            }
        }
    }

    // Erwartete Antwort (nur bei noch offenen Fragen sinnvoll als Frage)
    if (sq.status !== "answered") {
        const expectation = (() => {
            switch (sq.type) {
                case "radius":
                    return d.within === false
                        ? t("sqp.expectOutside", loc)
                        : t("sqp.expectInside", loc);
                case "thermometer":
                    return d.warmer === false
                        ? t("sqp.expectColder", loc)
                        : t("sqp.expectWarmer", loc);
                case "tentacles":
                    return t("sqp.expectNearestStation", loc);
                case "matching":
                    return d.same === false
                        ? t("sqp.expectOtherZone", loc)
                        : t("sqp.expectSameZone", loc);
                case "measuring":
                    return d.hiderCloser === false
                        ? t("sqp.expectSeekerCloser", loc)
                        : t("sqp.expectHiderCloser", loc);
                default:
                    return null;
            }
        })();
        if (expectation) rows.push({ icon: "", text: expectation });
    }

    return (
        <div className="flex flex-col gap-0.5">
            {rows.map((row, i) => (
                <p key={i} className="text-xs font-medium text-white/90">
                    {row.icon ? `${row.icon} ${row.text}` : row.text}
                </p>
            ))}
        </div>
    );
}

// ── Preview label extraction ──────────────────────────────────────────────────

interface PreviewResult {
    /** Short human-readable result text */
    label: string;
    /** True = positive / inside / closer / same; False = negative */
    positive: boolean;
}

function extractPreviewLabel(
    type: string,
    data: unknown,
): PreviewResult | null {
    const d = data as any;
    if (!d) return null;

    const loc = locale.get();
    switch (type) {
        case "radius":
            if (typeof d.within === "boolean") {
                return {
                    label: d.within ? `✅ ${t("sqp.previewInside", loc)}` : `❌ ${t("sqp.previewOutside", loc)}`,
                    positive: d.within,
                };
            }
            break;
        case "thermometer":
            if (typeof d.warmer === "boolean") {
                return {
                    label: d.warmer ? `🔥 ${t("sqp.previewWarmer", loc)}` : `🧊 ${t("sqp.previewColder", loc)}`,
                    positive: d.warmer,
                };
            }
            break;
        case "tentacles": {
            const name =
                (d.location as any)?.properties?.name ??
                (d.location as any)?.properties?.display_name ??
                null;
            return {
                label: name ? `📍 ${t("sqp.previewNearestPlace", loc)}: ${name}` : `📍 ${t("sqp.previewPlaceFound", loc)}`,
                positive: !!d.location,
            };
        }
        case "measuring":
            if (typeof d.hiderCloser === "boolean") {
                return {
                    label: d.hiderCloser
                        ? `📏 ${t("sqp.previewHiderCloser", loc)}`
                        : `📏 ${t("sqp.previewSeekerCloser", loc)}`,
                    positive: d.hiderCloser,
                };
            }
            break;
        case "matching":
            if (typeof d.same === "boolean") {
                return {
                    label: d.same ? `✅ ${t("sqp.previewSameZone", loc)}` : `❌ ${t("sqp.previewOtherZone", loc)}`,
                    positive: d.same,
                };
            }
            break;
    }
    return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SessionQuestionPanel() {
    const tr = useT();
    const participant = useStore(sessionParticipant);
    const code = useStore(sessionCode);
    const sqList = useStore(sessionQuestions);
    const $hiderMode = useStore(hiderMode);
    const $isLoading = useStore(isLoading);
    const $localQuestions = useStore(questions_atom);
    const $gpsTracking = useStore(thermometerGpsTracking);
    const [sendingType, setSendingType] = useState<string | null>(null);
    /**
     * Key of the locally-added question that is staged but not yet sent.
     * Stored in a global atom so it survives the sidebar Sheet unmounting
     * on mobile (when the user closes the panel to look at the map).
     */
    const pendingLocalKey = useStore(pendingDraftKey);
    const $pendingPickerType = useStore(pendingPickerType);

    // ── Hider answer state ──────────────────────────────────────────────────
    /** The session question currently being answered (preview mode) */
    const [pendingAnswerSq, setPendingAnswerSq] =
        useState<SessionQuestion | null>(null);
    /** Live-computed preview of the answer */
    const [previewResult, setPreviewResult] = useState<PreviewResult | null>(
        null,
    );
    /** The last fully computed answerData – sent when Hider clicks "Antwort senden" */
    const latestAnswerDataRef = useRef<unknown>(null);
    /** Tracks which question ID has already received the "deadline passed" toast to avoid duplicates */
    const lateNotifiedIdRef = useRef<string | null>(null);
    /** Leaflet polygons showing the Voronoi half-planes while the hider answers a thermometer question */
    const answerColdPolygonRef = useRef<L.Polygon | null>(null);
    const answerWarmPolygonRef = useRef<L.Polygon | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [loadingGPS, setLoadingGPS] = useState(false);
    /** Show GPS-vs-manual dialog when the hider starts answering without a pin */
    const [showLocationDialog, setShowLocationDialog] = useState(false);

    // ── React to question type selected in QuestionPickerSheet ──────────────
    useEffect(() => {
        if ($pendingPickerType === null) return;
        pendingPickerType.set(null);
        stageQuestion($pendingPickerType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [$pendingPickerType]);

    // ── Notify hider when the question being answered expires ───────────────
    // (We no longer cancel — late answers are still accepted by the server.)
    useEffect(() => {
        if (!pendingAnswerSq) {
            lateNotifiedIdRef.current = null;
            return;
        }
        const updated = sqList.find((q) => q.id === pendingAnswerSq.id);
        if (
            updated &&
            updated.status === "expired" &&
            lateNotifiedIdRef.current !== pendingAnswerSq.id
        ) {
            lateNotifiedIdRef.current = pendingAnswerSq.id;
            toast.warning(tr("sqp.deadlinePassedLate"));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sqList, pendingAnswerSq?.id]);

    // ── Live preview: recompute whenever hiderMode or pending question changes
    useEffect(() => {
        if (!pendingAnswerSq || $hiderMode === false) {
            setPreviewResult(null);
            latestAnswerDataRef.current = null;
            return;
        }

        let cancelled = false;
        hiderifyQuestion({
            id: pendingAnswerSq.type,
            key: 0,
            // Merge drag: true so hiderifyQuestion always runs the hider-side computation,
            // even for questions created before drag was explicitly set in the seeker's config.
            data: { ...(pendingAnswerSq.data as object), drag: true },
        } as any)
            .then((answered) => {
                if (cancelled) return;
                latestAnswerDataRef.current = answered.data;
                setPreviewResult(
                    extractPreviewLabel(pendingAnswerSq.type, answered.data),
                );
            })
            .catch(() => {
                if (!cancelled) setPreviewResult(null);
            });

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [$hiderMode, pendingAnswerSq]);

    // ── Map overlay: show Voronoi half-planes while hider answers a thermometer question
    // The cold polygon (A-side, blue) and warm polygon (B-side, red) are rendered on the
    // Leaflet map and highlight based on the hider's current pin position.
    useEffect(() => {
        const currentMap = leafletMapContext.get();

        // Clean up existing polygons
        if (answerColdPolygonRef.current) {
            currentMap?.removeLayer(answerColdPolygonRef.current);
            answerColdPolygonRef.current = null;
        }
        if (answerWarmPolygonRef.current) {
            currentMap?.removeLayer(answerWarmPolygonRef.current);
            answerWarmPolygonRef.current = null;
        }

        if (!currentMap || !pendingAnswerSq || pendingAnswerSq.type !== "thermometer" || $hiderMode === false) return;

        const d = pendingAnswerSq.data as Record<string, unknown>;
        const latA = typeof d.latA === "number" ? d.latA : null;
        const lngA = typeof d.lngA === "number" ? d.lngA : null;
        const latB = typeof d.latB === "number" ? d.latB : null;
        const lngB = typeof d.lngB === "number" ? d.lngB : null;
        if (latA === null || lngA === null || latB === null || lngB === null) return;

        const voronoi = computeThermometerVoronoi(latA, lngA, latB, lngB);
        if (!voronoi) return;

        const [coldCoords, warmCoords] = voronoi;
        const isWarmer = previewResult?.positive ?? null;
        // While computing (isWarmer === null), show both halves at medium opacity
        // so the bisector boundary is clearly visible.
        const noneSelected = isWarmer === null;

        // Cold polygon — A-side, blue — highlighted when hider is on the colder (closer-to-A) side
        answerColdPolygonRef.current = L.polygon(coldCoords, {
            color:       "#1a3a6b",
            fillColor:   "#1a3a6b",
            fillOpacity: isWarmer === false ? 0.40 : noneSelected ? 0.18 : 0.05,
            weight:      isWarmer === false ? 2.0  : noneSelected ? 1.5  : 0.5,
            opacity:     isWarmer === false ? 0.8  : noneSelected ? 0.5  : 0.15,
        }).addTo(currentMap);

        // Warm polygon — B-side, red — highlighted when hider is on the warmer (closer-to-B) side
        answerWarmPolygonRef.current = L.polygon(warmCoords, {
            color:       "#c0392b",
            fillColor:   "#c0392b",
            fillOpacity: isWarmer === true ? 0.40 : noneSelected ? 0.18 : 0.05,
            weight:      isWarmer === true ? 2.0  : noneSelected ? 1.5  : 0.5,
            opacity:     isWarmer === true ? 0.8  : noneSelected ? 0.5  : 0.15,
        }).addTo(currentMap);

        return () => {
            const m = leafletMapContext.get();
            if (answerColdPolygonRef.current) { m?.removeLayer(answerColdPolygonRef.current); answerColdPolygonRef.current = null; }
            if (answerWarmPolygonRef.current) { m?.removeLayer(answerWarmPolygonRef.current); answerWarmPolygonRef.current = null; }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingAnswerSq, $hiderMode, previewResult]);

    if (!participant || !code) return null;

    const isHider = participant.role === "hider";

    // ── Seeker: step 1 – add question locally so the seeker can configure it ─

    /** Internal helper: stage a question with explicit data (bypasses map-center defaults) */
    function stageQuestionWithData(type: string, data: Record<string, unknown>) {
        addLocalQuestion({ id: type as any, data });
        const added = [...questions_atom.get()].reverse().find((q) => q.id === type);
        if (added) pendingDraftKey.set(added.key as number);
    }

    function stageQuestion(type: string) {
        const map = leafletMapContext.get();
        if (!map) return;
        const center = map.getCenter();

        let questionData: Record<string, unknown>;
        if (type === "tentacles") {
            // Start with theme_park so schemaFifteen's default is used initially;
            // the user can then switch to any locationType in the question card.
            questionData = { lat: center.lat, lng: center.lng, locationType: "theme_park" };
        } else {
            questionData = { lat: center.lat, lng: center.lng };
        }

        stageQuestionWithData(type, questionData);
    }

    // ── Seeker: step 2 – send the staged question to the hider ───────────────
    async function sendPendingQuestion() {
        if (!code || !participant || pendingLocalKey === null) return;
        const match = questions_atom.get().find((q) => q.key === pendingLocalKey);
        if (!match) {
            toast.error(t("sqp.questionNotFound", locale.get()));
            pendingDraftKey.set(null);
            return;
        }
        setSendingType(match.id);
        try {
            await addQuestion(code, participant.token, {
                type: match.id,
                data: match.data,
            });
            toast.success(t("sqp.questionSent", locale.get()));
            pendingDraftKey.set(null);
        } catch (e: unknown) {
            toast.error((e as Error).message);
        } finally {
            setSendingType(null);
        }
    }

    // ── Seeker: cancel – remove the staged local question without sending ─────
    function cancelPendingQuestion() {
        if (pendingLocalKey === null) return;
        const current = questions_atom.get();
        questions_atom.set(current.filter((q) => q.key !== pendingLocalKey));
        pendingDraftKey.set(null);
    }

    // ── Hider: enter preview mode for a question ────────────────────────────
    function startAnswering(sq: SessionQuestion) {
        setPendingAnswerSq(sq);
        setPreviewResult(null);
        latestAnswerDataRef.current = null;
        // If hiderMode is not yet set, ask the hider how they want to position
        // their pin before computing an answer.
        if (hiderMode.get() === false) {
            setShowLocationDialog(true);
        }
    }

    function cancelAnswering() {
        setPendingAnswerSq(null);
        setPreviewResult(null);
        latestAnswerDataRef.current = null;
        setShowLocationDialog(false);
    }

    // ── Hider: request GPS position and activate the hider pin ─────────────
    async function loadGPS() {
        setShowLocationDialog(false);
        setLoadingGPS(true);
        try {
            const pos = await new Promise<GeolocationPosition>(
                (resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 10_000,
                        enableHighAccuracy: true,
                    }),
            );
            hiderMode.set({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
            });
        } catch {
            toast.error(t("sqp.gpsUnavailable", locale.get()));
        } finally {
            setLoadingGPS(false);
        }
    }

    // ── Hider: place pin at map center for manual positioning ───────────────
    function placeManualPin() {
        setShowLocationDialog(false);
        // Use the current map center as the starting position for the pin.
        // The hider can then drag it to the correct location.
        const map = leafletMapContext.get();
        if (map) {
            const center = map.getCenter();
            hiderMode.set({ latitude: center.lat, longitude: center.lng });
        } else {
            // Fallback: use a default location; the hider will drag it
            hiderMode.set({ latitude: 0, longitude: 0 });
        }
    }

    // ── Hider: submit the computed answer ───────────────────────────────────
    async function submitAnswer() {
        if (!pendingAnswerSq || !code || !participant) return;
        if (!latestAnswerDataRef.current) {
            toast.error(t("sqp.noAnswerYet", locale.get()));
            return;
        }
        setSubmitting(true);
        try {
            await answerQuestion(pendingAnswerSq.id, participant.token, {
                answerData: latestAnswerDataRef.current,
            });
            toast.success(t("sqp.answerSent", locale.get()));
            setPendingAnswerSq(null);
            setPreviewResult(null);
            latestAnswerDataRef.current = null;
        } catch (e: unknown) {
            toast.error((e as Error).message);
        } finally {
            setSubmitting(false);
        }
    }

    // ── Seeker view ──────────────────────────────────────────────────────────
    const pendingLocalQuestion =
        pendingLocalKey !== null
            ? $localQuestions.find((q) => q.key === pendingLocalKey) ?? null
            : null;

    if (!isHider) {
        return (
            <div className="flex flex-col gap-3 mt-2">
                {/* ── GPS tracking active indicator ────────────────────────── */}
                {$gpsTracking !== null &&
                    $gpsTracking.questionKey === pendingLocalKey && (
                    <div className="rounded-md px-3 py-2 text-xs text-white flex items-center gap-2"
                        style={{ backgroundColor: "#067BC2" }}>
                        <span>🛰️</span>
                        <span>
                            GPS-Tracking läuft…{" "}
                            {$gpsTracking.traveled.toFixed(2)} /{" "}
                            {$gpsTracking.targetKm} km
                        </span>
                    </div>
                )}


                <QuestionList
                    questions={sqList}
                    isHider={false}
                    pendingLocalQuestion={pendingLocalQuestion}
                    sendingType={sendingType}
                    onCancelPending={cancelPendingQuestion}
                    onSendPending={
                        // Disable send while GPS tracking is still running for this question
                        $gpsTracking !== null && $gpsTracking.questionKey === pendingLocalKey
                            ? undefined
                            : sendPendingQuestion
                    }
                />
            </div>
        );
    }

    // ── Hider view ───────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-3 mt-2">
            {/* GPS vs. manual pin selection dialog */}
            <Dialog
                open={showLocationDialog}
                onOpenChange={(open) => {
                    if (!open) setShowLocationDialog(false);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{tr("sqp.locationDialogTitle")}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {tr("sqp.locationDialogDesc")}
                    </p>
                    <div className="flex flex-col gap-2 mt-2">
                        <Button
                            onClick={loadGPS}
                            disabled={loadingGPS}
                            className="w-full text-white border-0 disabled:opacity-40"
                            style={{ backgroundColor: "#067BC2" }}
                        >
                            {loadingGPS
                                ? tr("sqp.loadingGps")
                                : `📍 ${tr("sqp.useGps")}`}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={placeManualPin}
                            className="w-full border-2 font-medium"
                            style={{ borderColor: "#067BC2", color: "#067BC2" }}
                        >
                            🗺️ {tr("sqp.placeManualPin")}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
            {/* GPS / Pin status bar */}
            <div className="flex items-center gap-2 flex-wrap rounded-md px-2 py-1.5" style={{ backgroundColor: "#84BCDA" }}>
                <MapPin className="h-4 w-4 shrink-0 text-white" />
                {$hiderMode && typeof $hiderMode === "object" ? (
                    <>
                        <span className="text-xs font-medium text-white">
                            GPS:{" "}
                            {$hiderMode.latitude.toFixed(4)},{" "}
                            {$hiderMode.longitude.toFixed(4)}
                        </span>
                        <button
                            type="button"
                            className="ml-auto text-xs underline font-medium"
                            style={{ color: "#D56062" }}
                            onClick={() => hiderMode.set(false)}
                        >
                            {tr("sqp.removePin")}
                        </button>
                    </>
                ) : (
                    <span className="text-xs text-white/80">
                        {tr("sqp.noPinSet")}
                    </span>
                )}
            </div>

            {/* ── Active answer preview panel ─────────────────────────────── */}
            {pendingAnswerSq && (
                <div className="rounded-md p-3 flex flex-col gap-2" style={{ backgroundColor: "#067BC2" }}>
                    <p className="text-sm font-bold text-white">
                        {getQuestionLabel(pendingAnswerSq.type)}{" "}
                        – {tr("sqp.prepareAnswer")}
                    </p>

                    {/* GPS button */}
                    <Button
                        size="sm"
                        disabled={loadingGPS}
                        onClick={loadGPS}
                        className="self-start border-0 font-bold disabled:opacity-40"
                        style={{ backgroundColor: "#84BCDA", color: "#fff" }}
                    >
                        {loadingGPS ? tr("sqp.loadingGps") : `📍 ${tr("sqp.useGpsShort")}`}
                    </Button>

                    {/* Live preview */}
                    {$hiderMode === false ? (
                        <p className="text-xs text-white/70">
                            {tr("sqp.setPinHint")}
                        </p>
                    ) : previewResult ? (
                        <div
                            className="rounded px-3 py-2 text-sm font-bold text-white"
                            style={{ backgroundColor: previewResult.positive ? "#ECC30B" : "#D56062",
                                     color: previewResult.positive ? "#000" : "#fff" }}
                        >
                            {previewResult.label}
                        </div>
                    ) : (
                        <p className="text-xs text-white/70">
                            {tr("sqp.computing")}
                        </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-col items-start gap-1 mt-1">
                        <Button
                            size="sm"
                            disabled={
                                submitting ||
                                !latestAnswerDataRef.current ||
                                $hiderMode === false
                            }
                            onClick={submitAnswer}
                            className="border-0 font-bold disabled:opacity-40"
                            style={{ backgroundColor: "#ECC30B", color: "#000" }}
                        >
                            {submitting ? tr("sqp.sending") : tr("sqp.sendAnswer")}
                        </Button>
                        <button
                            type="button"
                            onClick={cancelAnswering}
                            disabled={submitting}
                            className="text-xs underline font-medium disabled:opacity-40"
                            style={{ color: "#84BCDA" }}
                        >
                            {tr("sqp.cancel")}
                        </button>
                    </div>
                </div>
            )}

            <QuestionList
                questions={sqList.filter((q) => q.status !== "answered")}
                isHider={true}
                onAnswer={startAnswering}
                pendingAnswerId={pendingAnswerSq?.id ?? null}
            />
        </div>
    );
}

// ── Pending question configuration (Seeker) ──────────────────────────────────

function PendingQuestionConfig({ question }: { question: ReturnType<typeof questions_atom.get>[number] }) {
    switch (question.id) {
        case "radius":
            return (
                <RadiusQuestionComponent
                    data={question.data}
                    questionKey={question.key as number}
                    embedded
                />
            );
        case "thermometer":
            return (
                <ThermometerQuestionComponent
                    data={question.data}
                    questionKey={question.key as number}
                    embedded
                />
            );
        case "tentacles":
            return (
                <TentacleQuestionComponent
                    data={question.data}
                    questionKey={question.key as number}
                    embedded
                />
            );
        case "matching":
            return (
                <MatchingQuestionComponent
                    data={question.data}
                    questionKey={question.key as number}
                    embedded
                />
            );
        case "measuring":
            return (
                <MeasuringQuestionComponent
                    data={question.data}
                    questionKey={question.key as number}
                    embedded
                />
            );
        default:
            return null;
    }
}

// ── Countdown timer component ─────────────────────────────────────────────────

/**
 * Displays a live MM:SS countdown derived from an ISO8601 deadline string.
 * Colour transitions: white → orange (< 60 s) → red+pulse (< 10 s).
 * Shows "Zeit abgelaufen" once the timer reaches zero.
 */
function QuestionCountdown({ deadline }: { deadline: string }) {
    const tr = useT();

    function getRemainingMs(): number {
        return new Date(deadline).getTime() - Date.now();
    }

    const [remainingMs, setRemainingMs] = useState<number>(getRemainingMs);

    useEffect(() => {
        // Sync immediately in case of mount delay
        setRemainingMs(getRemainingMs());

        const interval = setInterval(() => {
            const ms = getRemainingMs();
            setRemainingMs(ms);
            if (ms <= 0) clearInterval(interval);
        }, 1000);

        return () => clearInterval(interval);
    // deadline is stable (ISO string) so no dep needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deadline]);

    if (remainingMs <= 0) {
        return (
            <span className="text-xs font-bold" style={{ color: "#D56062" }}>
                ⏰ {tr("sqp.timeExpired")}
            </span>
        );
    }

    const totalSec = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    const isRed = remainingMs < 10_000;
    const isOrange = !isRed && remainingMs < 60_000;

    const color = isRed ? "#D56062" : isOrange ? "#F37748" : "rgba(255,255,255,0.85)";

    return (
        <span
            className={`text-xs font-bold tabular-nums${isRed ? " animate-pulse" : ""}`}
            style={{ color }}
        >
            ⏱ {formatted}
        </span>
    );
}

// ── Shared question list ─────────────────────────────────────────────────────

export function QuestionList({
    questions,
    isHider,
    onAnswer,
    pendingAnswerId,
    pendingLocalQuestion,
    sendingType,
    onCancelPending,
    onSendPending,
}: {
    questions: SessionQuestion[];
    isHider: boolean;
    onAnswer?: (q: SessionQuestion) => void;
    /** ID of the question currently in preview mode – disables its button */
    pendingAnswerId?: string | null;
    /** Seeker only: the locally staged question not yet sent */
    pendingLocalQuestion?: ReturnType<typeof questions_atom.get>[number] | null;
    /** Seeker only: sending state for the staged question */
    sendingType?: string | null;
    /** Seeker only: cancel staging */
    onCancelPending?: () => void;
    /** Seeker only: send staged question */
    onSendPending?: () => void;
}) {
    const tr = useT();
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const hasAnyQuestion = questions.length > 0 || !!pendingLocalQuestion;

    // Only the newest pending question is "active" and gets a countdown.
    const activePendingId =
        [...questions].reverse().find((q) => q.status === "pending")?.id ?? null;

    if (!hasAnyQuestion) {
        return (
            <p className="text-xs text-muted-foreground italic">
                {tr("sqp.noQuestionsYet")}
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {/* ── State A: staged local question (Seeker only, not yet sent) ─── */}
            {pendingLocalQuestion && (
                <div className="rounded-md p-2 text-sm flex flex-col gap-2"
                    style={{ backgroundColor: "#067BC2" }}>
                    {/* Header */}
                    <div className="flex items-center gap-2">
                        <Send className="h-4 w-4 shrink-0 text-white" />
                        <span className="font-bold flex-1 min-w-0 text-white">
                            {getQuestionLabel(pendingLocalQuestion.id)}
                            {/* Only show "konfigurieren" for types that still need inline setup */}
                            {(pendingLocalQuestion.id === "matching" || pendingLocalQuestion.id === "measuring") && (
                                <span className="ml-2 text-xs font-normal" style={{ color: "#84BCDA" }}>
                                    {tr("sqp.configure")}
                                </span>
                            )}
                        </span>
                    </div>
                    {/* Inline config UI — only for types without a dedicated picker (matching, measuring).
                        Thermometer, radius and tentacles are fully configured before staging. */}
                    {(pendingLocalQuestion.id === "matching" || pendingLocalQuestion.id === "measuring") && (
                        <div className="rounded-md p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                            <PendingQuestionConfig question={pendingLocalQuestion} />
                        </div>
                    )}
                    {/* Action buttons */}
                    <div className="flex flex-col items-start gap-1">
                        <Button
                            size="sm"
                            disabled={sendingType !== null || onSendPending === undefined}
                            onClick={onSendPending}
                            className="border-0 font-bold disabled:opacity-40"
                            style={{ backgroundColor: "#ECC30B", color: "#000" }}
                        >
                            {sendingType !== null
                                ? tr("sqp.sending")
                                : onSendPending === undefined
                                    ? "🛰️ Tracking läuft…"
                                    : tr("sqp.sendQuestion")}
                            {onSendPending !== undefined && <Send className="ml-1 h-3 w-3" />}
                        </Button>
                        <button
                            type="button"
                            onClick={onCancelPending}
                            disabled={sendingType !== null}
                            className="text-xs underline font-medium disabled:opacity-40"
                            style={{ color: "#84BCDA" }}
                        >
                            {tr("sqp.cancel")}
                        </button>
                    </div>
                </div>
            )}

            {/* ── States B / C / D: sent session questions ──────────────── */}
            {[...questions].reverse().map((sq) => {
                const shortDesc = describeQuestion(sq.type, sq.data as any, sq.answerData as any);
                const isExpanded = expandedId === sq.id;
                const isAnswered = sq.status === "answered";
                const isExpired = sq.status === "expired";
                const isPending = sq.status === "pending";
                const isActive = sq.id === activePendingId;

                // State C (answered): #84BCDA; State D (expired): dark grey; State B (pending): #F37748
                const bgColor = isAnswered ? "#84BCDA" : isExpired ? "#6b7280" : "#F37748";
                const accentColor = isAnswered ? "#067BC2" : isExpired ? "#d1d5db" : "#ECC30B";

                const statusLabel = isAnswered
                    ? tr("sqp.answered")
                    : isExpired
                        ? tr("sqp.expired")
                        : tr("sqp.pending");

                // Lateness: how many seconds/minutes after the deadline was the question answered?
                const lateMs =
                    isAnswered && sq.answeredAt && sq.deadline
                        ? new Date(sq.answeredAt).getTime() - new Date(sq.deadline).getTime()
                        : 0;
                const lateLabel = lateMs > 0 ? formatLateness(lateMs) : null;

                return (
                    <div
                        key={sq.id}
                        className="rounded-md p-2 text-sm"
                        style={{ backgroundColor: bgColor }}
                    >
                        {/* ── Header row: icon + label + chevron + action button ── */}
                        <div
                            className="flex items-center gap-2 cursor-pointer select-none"
                            onClick={() =>
                                setExpandedId(isExpanded ? null : sq.id)
                            }
                        >
                            {isAnswered ? (
                                <CheckCircle className="h-4 w-4 shrink-0 text-white" />
                            ) : (
                                <Clock className="h-4 w-4 shrink-0 text-white" />
                            )}
                            <span className="font-semibold flex-1 min-w-0 text-white">
                                {getQuestionLabel(sq.type)}
                                <span className="ml-2 text-xs font-normal" style={{ color: accentColor }}>
                                    {statusLabel}
                                </span>
                                {lateLabel && (
                                    <span className="ml-2 text-xs font-normal" style={{ color: "#F59E0B" }}>
                                        {lateLabel}
                                    </span>
                                )}
                            </span>
                            <ChevronDown
                                className={`h-3 w-3 transition-transform shrink-0 text-white ${isExpanded ? "rotate-180" : ""}`}
                            />
                            {isHider && (isPending || isExpired) && onAnswer && (
                                <Button
                                    size="sm"
                                    disabled={pendingAnswerId === sq.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAnswer(sq);
                                    }}
                                    className="border-0 font-bold disabled:opacity-40"
                                    style={{ backgroundColor: "#ECC30B", color: "#000" }}
                                >
                                    {pendingAnswerId === sq.id
                                        ? tr("sqp.inProgress")
                                        : tr("sqp.answer")}
                                </Button>
                            )}
                        </div>

                        {/* ── Short description (always visible) ── */}
                        {shortDesc && (
                            <p className="text-xs mt-0.5 ml-6 leading-snug text-white/80">
                                {shortDesc}
                            </p>
                        )}

                        {/* ── Countdown: only on the active (newest pending) question ── */}
                        {isActive && sq.deadline && (
                            <div className="mt-1 ml-6">
                                <QuestionCountdown deadline={sq.deadline} />
                            </div>
                        )}

                        {/* ── Expired notice ── */}
                        {isExpired && (
                            <p className="text-xs mt-1 ml-6 font-medium" style={{ color: "#d1d5db" }}>
                                ⏰ {tr("sqp.countdownExpired")}
                            </p>
                        )}

                        {/* ── Expanded details (text only – no config UI) ── */}
                        {isExpanded && (
                            <div className="mt-2 ml-6 pt-2 border-t border-white/30">
                                <QuestionDetails
                                    sq={{
                                        type: sq.type,
                                        data: sq.data,
                                        status: sq.status,
                                        answerData: sq.answerData,
                                    }}
                                    answered={isAnswered}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
