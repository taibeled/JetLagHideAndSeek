import { useStore } from "@nanostores/react";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import * as turf from "@turf/turf";
import { useEffect, useMemo, useState } from "react";
import {
    CircleMarker,
    FeatureGroup,
    GeoJSON,
    Pane,
    Tooltip,
} from "react-leaflet";

import {
    hiderMode,
    mapGeoJSON,
    polyGeoJSON,
    questionFinishedMapData,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import {
    findHomeGamePoiPointsInPlayZone,
    findTentacleLocations,
    ICON_COLORS,
} from "@/maps/api";
import {
    clippedVoronoiCells,
    holedMask,
    mergeNearbyPoiPointsForLocation,
    safeUnion,
} from "@/maps/geo-utils";
import type {
    APILocations,
    MatchingQuestion,
    MeasuringQuestion,
    TentacleQuestion,
    TraditionalTentacleQuestion,
    Units,
} from "@/maps/schema";

type ClipPolygon = Feature<Polygon | MultiPolygon> | null;

/** Above Leaflet overlayPane (400), below markerPane (600). Keeps taps reaching POI CircleMarkers instead of hiding-zone GeoJSON drawn imperatively on overlayPane. */
const POI_CANDIDATES_PANE_Z = 550;

const HOME_GAME_POI_TYPES = new Set<string>([
    "aquarium",
    "zoo",
    "theme_park",
    "peak",
    "museum",
    "hospital",
    "cinema",
    "library",
    "golf_course",
    "consulate",
    "park",
]);

function isHomeGameMeasuringPoiType(
    type: MeasuringQuestion["type"],
): type is APILocations {
    return HOME_GAME_POI_TYPES.has(type);
}

function matchingTypeToPoiOverlayLocation(
    type: MatchingQuestion["type"],
): APILocations | null {
    if (HOME_GAME_POI_TYPES.has(type)) {
        return type as APILocations;
    }
    if (typeof type === "string" && type.endsWith("-full")) {
        const base = type.slice(0, -"-full".length);
        if (HOME_GAME_POI_TYPES.has(base)) {
            return base as APILocations;
        }
    }
    return null;
}

function filterPointsWithinRadius(
    points: FeatureCollection,
    centerLng: number,
    centerLat: number,
    radius: number,
    unit: Units,
): FeatureCollection {
    if (
        centerLng === null ||
        centerLat === null ||
        radius === undefined ||
        radius === null
    ) {
        return points;
    }
    const center = turf.point([centerLng, centerLat]);

    return turf.featureCollection(
        points.features.filter((feature: any) => {
            const coords =
                feature?.geometry?.coordinates ??
                (feature?.properties?.lon && feature?.properties?.lat
                    ? [feature.properties.lon, feature.properties.lat]
                    : null);

            if (!coords) return false;

            const pt = turf.point(coords);
            const dist = turf.distance(center, pt, { units: unit });
            return dist <= radius;
        }),
    );
}

function candidateMarkerColor(questionColor: keyof typeof ICON_COLORS) {
    return ICON_COLORS[questionColor] ?? ICON_COLORS.blue;
}

function siteName(cell: Feature<Polygon | MultiPolygon>): string | null {
    const props = cell.properties as
        | { site?: { properties?: { name?: unknown } } }
        | null;
    const name = props?.site?.properties?.name;
    return typeof name === "string" ? name : null;
}

/** Hue 0 (red) → ~58 (yellow) so neighbouring administrative colours stay distinguishable. */
function spectrumHue(rank: number, n: number): number {
    if (n <= 1) return 29;
    return (rank / (n - 1)) * 58;
}

/** Vary lightness along the sorted list (orthogonal to hue) so cells differ in brightness too. Clamped so colours stay legible. */
function spectrumLightness(
    rank: number,
    n: number,
): { strokeL: number; fillL: number } {
    const baseStroke = 34;
    const baseFill = 48;
    if (n <= 1) {
        return { strokeL: baseStroke, fillL: baseFill };
    }
    const t = (rank / (n - 1)) * Math.PI * 5;
    const strokeL = Math.round(
        Math.min(44, Math.max(26, baseStroke + 7 * Math.sin(t))),
    );
    const fillL = Math.round(
        Math.min(58, Math.max(38, baseFill + 9 * Math.sin(t + 1.15))),
    );
    return { strokeL, fillL };
}

/** Stroke/fill HSL for one spectrum Voronoi cell — reuse for CircleMarkers so dots match cell fills. */
function spectrumCellStrokeFill(rank: number, n: number): {
    stroke: string;
    fill: string;
} {
    const hue = spectrumHue(rank, n);
    const { strokeL, fillL } = spectrumLightness(rank, n);
    return {
        stroke: `hsl(${hue}, 82%, ${strokeL}%)`,
        fill: `hsl(${hue}, 76%, ${fillL}%)`,
    };
}

const PIN_VORONOI_STROKE = "hsl(175, 82%, 30%)";
const PIN_VORONOI_FILL = "hsl(168, 72%, 42%)";

/** Same ordering as `rankedCells` (localeCompare by POI name, fallback `\0${index}`). */
function spectrumRankByFeatureIndex(points: FeatureCollection<Point>): number[] {
    const decorated = points.features.map((f, index) => ({
        index,
        sortKey: poiSortKey(f.properties?.name, index),
    }));
    decorated.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const ranks = new Array(points.features.length);
    decorated.forEach((d, rank) => {
        ranks[d.index] = rank;
    });
    return ranks;
}

function poiSortKey(name: unknown, index: number): string {
    return typeof name === "string" ? name : `\0${index}`;
}

function rankedCells(cells: Feature<Polygon | MultiPolygon>[]) {
    const decorated = cells.map((cell, index) => ({
        cell,
        index,
        sortKey: poiSortKey(siteName(cell), index),
    }));
    decorated.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return decorated.map((d, rank) => ({ ...d, rank }));
}

/** Matching: Voronoi cell that contains the seeker pin (nearest-POI territory). */
function pinSiteNameFromCells(
    cells: Feature<Polygon | MultiPolygon>[],
    pin: { lng: number; lat: number },
): string | null {
    const pt = turf.point([pin.lng, pin.lat]);
    for (const cell of cells) {
        try {
            if (
                turf.booleanPointInPolygon(
                    pt,
                    cell as Feature<Polygon | MultiPolygon>,
                )
            ) {
                return siteName(cell);
            }
        } catch {
            continue;
        }
    }
    return null;
}

/** Renders Voronoi cells (clipped to play zone) under the candidate dots so seekers can see each POI's territory. Non-interactive so taps reach the markers. */
function VoronoiCells({
    points,
    clip,
    accentColor,
    spectrum,
    selectedName,
    highlightPin,
}: {
    points: FeatureCollection<Point>;
    clip: ClipPolygon;
    /** Used when spectrum is false (tentacles). */
    accentColor: string;
    /** Spread fills/strokes red→yellow per cell (matching / measuring play zone). */
    spectrum: boolean;
    selectedName?: string | null;
    /** Highlight the cell under the matching question pin as “your” nearest POI. */
    highlightPin?: { lng: number; lat: number } | null;
}) {
    const cells = useMemo(
        () => clippedVoronoiCells(points, clip),
        [points, clip],
    );

    const pinSiteName =
        spectrum && highlightPin && cells.length > 0
            ? pinSiteNameFromCells(cells, highlightPin)
            : null;

    if (cells.length === 0) return null;

    const items = spectrum
        ? rankedCells(cells)
        : cells.map((cell, index) => ({ cell, rank: 0, index }));

    return (
        <>
            {items.map(({ cell, rank, index }) => {
                    const name = siteName(cell);
                    const isTentacleSelected =
                        !spectrum && !!selectedName && name === selectedName;
                    const isPinCell =
                        spectrum && !!pinSiteName && name === pinSiteName;

                    let stroke: string;
                    let fill: string;
                    let weight: number;
                    let strokeOpacity: number;
                    let fillOpacity: number;

                    if (!spectrum) {
                        stroke = accentColor;
                        fill = accentColor;
                        weight = isTentacleSelected ? 1.5 : 0.6;
                        strokeOpacity = 0.55;
                        fillOpacity = isTentacleSelected ? 0.18 : 0.07;
                    } else if (isPinCell) {
                        stroke = PIN_VORONOI_STROKE;
                        fill = PIN_VORONOI_FILL;
                        weight = 2.4;
                        strokeOpacity = 0.92;
                        fillOpacity = 0.26;
                    } else {
                        ({ stroke, fill } = spectrumCellStrokeFill(
                            rank,
                            cells.length,
                        ));
                        weight = 0.65;
                        strokeOpacity = 0.62;
                        fillOpacity = 0.11;
                    }

                    return (
                        <GeoJSON
                            key={`v-${name ?? "_"}-${index}`}
                            data={cell}
                            interactive={false}
                            style={{
                                color: stroke,
                                weight,
                                opacity: strokeOpacity,
                                fillColor: fill,
                                fillOpacity,
                            }}
                        />
                    );
                })}
        </>
    );
}

function TentacleTraditionalCandidates({
    questionKey,
    snapshot,
    clip,
}: {
    questionKey: number;
    snapshot: TraditionalTentacleQuestion;
    clip: ClipPolygon;
}) {
    const [features, setFeatures] = useState<FeatureCollection | null>(null);

    useEffect(() => {
        let cancelled = false;
        void findTentacleLocations(snapshot).then((raw) => {
            if (cancelled) return;
            const filtered = filterPointsWithinRadius(
                raw,
                snapshot.lng,
                snapshot.lat,
                snapshot.radius,
                snapshot.unit,
            );
            setFeatures(filtered);
        });
        return () => {
            cancelled = true;
        };
    }, [
        questionKey,
        snapshot.lat,
        snapshot.lng,
        snapshot.radius,
        snapshot.unit,
        snapshot.locationType,
    ]);

    const loc = snapshot.location;
    const selectedName =
        loc && typeof loc === "object" && "properties" in loc
            ? loc.properties?.name
            : null;

    const stroke = candidateMarkerColor(snapshot.color);

    if (!features || features.features.length === 0) return null;

    return (
        <>
            <VoronoiCells
                points={features as FeatureCollection<Point>}
                clip={clip}
                accentColor={stroke}
                spectrum={false}
                selectedName={selectedName}
            />
            {features.features.map((feature: any, i: number) => {
                const coords = feature?.geometry?.coordinates;
                if (
                    !coords ||
                    typeof coords[0] !== "number" ||
                    typeof coords[1] !== "number"
                )
                    return null;
                const name = feature.properties?.name ?? "POI";
                const isSelected =
                    selectedName !== null && feature.properties?.name === selectedName;
                const [lng, lat] = coords;
                return (
                    <CircleMarker
                        key={`t-${questionKey}-${name}-${i}`}
                        center={[lat, lng]}
                        radius={isSelected ? 9 : 6}
                        pathOptions={{
                            color: isSelected ? "#ffffff" : stroke,
                            fillColor: stroke,
                            fillOpacity: isSelected ? 1 : 0.75,
                            weight: isSelected ? 3 : 1.5,
                        }}
                        interactive
                    >
                        <Tooltip
                            direction="top"
                            offset={[0, -4]}
                            opacity={0.9}
                            sticky
                        >
                            {name}
                        </Tooltip>
                    </CircleMarker>
                );
            })}
        </>
    );
}

function PlayZonePoiCandidates({
    questionKey,
    locationType,
    color,
    markerKeyPrefix,
    loadingText,
    clip,
    highlightPin,
}: {
    questionKey: number;
    locationType: APILocations;
    color: keyof typeof ICON_COLORS;
    markerKeyPrefix: string;
    loadingText: string;
    clip: ClipPolygon;
    /** Matching only: pin whose Voronoi cell is emphasized vs spectrum neighbours. */
    highlightPin?: { lng: number; lat: number } | null;
}) {
    const [features, setFeatures] = useState<FeatureCollection | null>(null);
    const $refresh = useStore(triggerLocalRefresh);

    useEffect(() => {
        let cancelled = false;
        void findHomeGamePoiPointsInPlayZone(locationType, loadingText).then(
            (fc) => {
                if (cancelled) return;
                const prepared =
                    markerKeyPrefix === "match-"
                        ? mergeNearbyPoiPointsForLocation(fc, locationType)
                        : fc;
                setFeatures(prepared);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [questionKey, locationType, loadingText, $refresh]);

    const stroke = candidateMarkerColor(color);

    const pinSiteName = useMemo(() => {
        if (!highlightPin || !features) return null;
        const cells = clippedVoronoiCells(
            features as FeatureCollection<Point>,
            clip,
        );
        return pinSiteNameFromCells(cells, highlightPin);
    }, [highlightPin, features, clip]);

    const spectrumRanks = useMemo(() => {
        if (!features) return [];
        return spectrumRankByFeatureIndex(features as FeatureCollection<Point>);
    }, [features]);

    if (!features || features.features.length === 0) return null;

    const isMatchingOverlay = markerKeyPrefix === "match-";
    const nPois = features.features.length;

    return (
        <>
            <VoronoiCells
                points={features as FeatureCollection<Point>}
                clip={clip}
                accentColor={stroke}
                spectrum
                highlightPin={isMatchingOverlay ? highlightPin : null}
            />
            {features.features.map((feature: any, i: number) => {
                const coords = feature?.geometry?.coordinates;
                if (
                    !coords ||
                    typeof coords[0] !== "number" ||
                    typeof coords[1] !== "number"
                )
                    return null;
                const name = feature.properties?.name ?? "POI";
                const [lng, lat] = coords;
                const isPinPoi =
                    isMatchingOverlay &&
                    pinSiteName !== null &&
                    name === pinSiteName;
                const rank = spectrumRanks[i] ?? 0;
                const { stroke: dotStroke, fill: dotFill } = isPinPoi
                    ? {
                          stroke: PIN_VORONOI_STROKE,
                          fill: PIN_VORONOI_FILL,
                      }
                    : spectrumCellStrokeFill(rank, nPois);
                return (
                    <CircleMarker
                        key={`${markerKeyPrefix}${questionKey}-${name}-${i}`}
                        center={[lat, lng]}
                        radius={isPinPoi ? 9 : 6}
                        pathOptions={{
                            color: dotStroke,
                            fillColor: dotFill,
                            fillOpacity: isPinPoi ? 0.92 : 0.88,
                            weight: isPinPoi ? 3 : 1.5,
                        }}
                        interactive
                    >
                        <Tooltip
                            direction="top"
                            offset={[0, -4]}
                            opacity={0.9}
                            sticky
                        >
                            {name}
                        </Tooltip>
                    </CircleMarker>
                );
            })}
        </>
    );
}

/**
 * Map overlay for POI-backed tentacle (traditional), home-game measuring, and eligible matching questions when unlocked.
 * Custom tentacle markers remain in PolygonDraw.
 */
export function PoiCandidatesLayer() {
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);
    const $polyGeoJSON = useStore(polyGeoJSON);
    const $mapGeoJSON = useStore(mapGeoJSON);
    const $questionFinishedMapData = useStore(questionFinishedMapData);
    const $refresh = useStore(triggerLocalRefresh);

    /** Play boundary ∩ current solution polygon (narrows as questions apply). */
    const clip = useMemo<ClipPolygon>(() => {
        const fc = $polyGeoJSON ?? $mapGeoJSON;
        if (!fc || fc.features.length === 0) return null;
        try {
            const playUnion = safeUnion(fc) as Feature<Polygon | MultiPolygon>;

            if (
                !$questionFinishedMapData?.features?.length ||
                ($questionFinishedMapData.features.length === 1 &&
                    !$questionFinishedMapData.features[0]?.geometry)
            ) {
                return playUnion;
            }

            const solutionPoly = holedMask($questionFinishedMapData);
            if (!solutionPoly) return playUnion;

            const combined = turf.intersect(
                turf.featureCollection([playUnion, solutionPoly]),
            );
            return (combined ?? playUnion) as Feature<Polygon | MultiPolygon>;
        } catch {
            return null;
        }
    }, [$polyGeoJSON, $mapGeoJSON, $questionFinishedMapData]);

    const layers = useMemo(() => {
        return $questions.flatMap((q) => {
            if (!q.data?.drag) return [];

            if (q.id === "tentacles") {
                const data = q.data as TentacleQuestion;
                if (data.locationType === "custom") return [];
                const snap = data as TraditionalTentacleQuestion;
                return [
                    <TentacleTraditionalCandidates
                        key={q.key}
                        questionKey={q.key}
                        snapshot={snap}
                        clip={clip}
                    />,
                ];
            }

            if (q.id === "measuring" && isHomeGameMeasuringPoiType(q.data.type)) {
                return [
                    <PlayZonePoiCandidates
                        key={q.key}
                        questionKey={q.key}
                        locationType={q.data.type}
                        color={q.data.color}
                        markerKeyPrefix="m-"
                        loadingText="Loading measuring POIs..."
                        clip={clip}
                    />,
                ];
            }

            if (q.id === "matching") {
                const loc = matchingTypeToPoiOverlayLocation(q.data.type);
                if (!loc) return [];
                return [
                    <PlayZonePoiCandidates
                        key={q.key}
                        questionKey={q.key}
                        locationType={loc}
                        color={q.data.color}
                        markerKeyPrefix="match-"
                        loadingText="Loading matching POIs..."
                        clip={clip}
                        highlightPin={{
                            lng: q.data.lng,
                            lat: q.data.lat,
                        }}
                    />,
                ];
            }

            return [];
        });
    }, [$questions, clip, $refresh]);

    if ($hiderMode !== false) return null;

    if (layers.length === 0) return null;

    return (
        <Pane
            name="poiCandidatesPane"
            style={{ zIndex: POI_CANDIDATES_PANE_Z }}
        >
            <FeatureGroup>{layers}</FeatureGroup>
        </Pane>
    );
}
