/**
 * Pure helpers for the hiding-zone / station pipeline in ZoneSidebar.
 *
 * Extracted from the single monolithic `initializeHidingZones` effect so
 * we can:
 *   1. Split fetch-and-build-circles (Phase A) from the cheap
 *      question-driven filter pass (Phase B). Phase A is expensive but
 *      rarely invalidated; Phase B runs on every question edit but is
 *      now fully client-side.
 *   2. Unit-test the filter logic with synthetic circles outside React.
 *   3. Bbox-prefilter circles against the playable region before the
 *      expensive `turf.booleanWithin` call, which is the single hottest
 *      inner operation for big metros like NYC.
 *
 * None of these functions read nanostores. Pass everything in.
 */

import * as turf from "@turf/turf";
import type {
    BBox,
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import type { toast as toastFn } from "react-toastify";

import { getGtfsStationNamesForLineRef } from "@/lib/transit/line-membership";
import {
    lookupArrivalWithParentFallback,
    type MatchedStation,
    stationNameMatchKey,
} from "@/lib/transit/osm-gtfs-match";
import type { TransitStop } from "@/lib/transit/types";
import {
    DEFAULT_ADMIN_BOUNDARY_OVERPASS_TIMEOUT_SEC,
    findPlacesSpecificInZone,
    QuestionSpecificLocation,
    type StationCircle,
    type StationPlace,
    trainLineNodeFinder,
} from "@/maps/api";
import { safeUnion } from "@/maps/geo-utils/operators";
import { extractStationName } from "@/maps/geo-utils/special";
import { geoSpatialVoronoi } from "@/maps/geo-utils/voronoi";
import {
    determineMatchingBoundary,
    findMatchingPlaces,
} from "@/maps/questions/matching";
import type {
    MatchingQuestion,
    MatchingQuestionWithFacilityOsmRefs,
    Question,
} from "@/maps/schema";

// ---------------------------------------------------------------------------
// Phase A: build the raw circle set (no question filtering)
// ---------------------------------------------------------------------------

export interface BuildCirclesOptions {
    radius: number;
    units: turf.Units;
    /** Passed through into circle.properties so downstream callers can
     *  recover the OSM id/name. */
    steps?: number;
}

/**
 * Turn a list of station points into turf circles of the given radius.
 * Pure; no store access, no async. Safe to memoize on
 * (places-signature, radius, units).
 */
export function buildCirclesFromPlaces(
    places: StationPlace[],
    { radius, units, steps = 32 }: BuildCirclesOptions,
): StationCircle[] {
    const out: StationCircle[] = [];
    for (const place of places) {
        const center = turf.getCoord(place);
        const circle = turf.circle(center, radius, {
            steps,
            units,
            properties: place,
        });
        out.push(circle);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Phase B: geometric cull against the playable region
// ---------------------------------------------------------------------------

/**
 * `questionFinishedMapData` is a HOLED MASK: one or more polygons whose
 * outer ring covers the whole world and whose inner rings (holes) are
 * the remaining playable regions. `turf.bbox` on such a polygon
 * collapses to the world bbox, which is useless for spatial
 * prefiltering.
 *
 * This helper walks the inner rings of every polygon and returns the
 * bbox spanning the playable holes. Returns null if no holes are
 * present (i.e. the mask has eliminated everything; nothing to keep).
 */
export function playableBboxFromHoledMask(
    data: FeatureCollection | Feature | null | undefined,
): BBox | null {
    if (!data) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hadAnyHole = false;

    const pushRing = (ring: number[][]) => {
        for (const c of ring) {
            const lng = c[0];
            const lat = c[1];
            if (lng < minX) minX = lng;
            if (lng > maxX) maxX = lng;
            if (lat < minY) minY = lat;
            if (lat > maxY) maxY = lat;
        }
        hadAnyHole = true;
    };

    const visit = (feature: Feature) => {
        const geom = feature.geometry;
        if (!geom) return;
        if (geom.type === "Polygon") {
            // Inner rings (index 1+) are holes.
            for (let i = 1; i < geom.coordinates.length; i++) {
                pushRing(geom.coordinates[i]);
            }
        } else if (geom.type === "MultiPolygon") {
            for (const poly of geom.coordinates) {
                for (let i = 1; i < poly.length; i++) {
                    pushRing(poly[i]);
                }
            }
        }
    };

    if ("type" in data && data.type === "FeatureCollection") {
        for (const f of data.features) visit(f);
    } else if ("type" in data && data.type === "Feature") {
        visit(data);
    }

    if (!hadAnyHole) return null;
    return [minX, minY, maxX, maxY];
}

/**
 * Approximate bbox of a point-centered circle, cheap to compute. Good
 * enough for a bbox-disjoint prefilter; the real `turf.booleanWithin`
 * handles the exact containment check afterwards.
 */
function cheapCircleBbox(lng: number, lat: number, radiusKm: number): BBox {
    const dLat = radiusKm / 111.32;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const dLng = radiusKm / (111.32 * Math.max(cosLat, 1e-6));
    return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/** True iff the two bboxes do not overlap at all. */
function bboxesDisjoint(a: BBox, b: BBox): boolean {
    return a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3];
}

export interface CullOptions {
    /** Bbox of the playable region, as returned by
     *  {@link playableBboxFromHoledMask}. If present, circles whose
     *  bbox is disjoint from this are dropped before the expensive
     *  `booleanWithin` test. */
    playableBbox: BBox | null;
    /** The holed-mask polygon that `booleanWithin` is checked against.
     *  Pre-unionized and simplified by the caller. */
    unionizedMask: Feature;
    /** Hiding radius converted to kilometers, used for cheap circle
     *  bbox construction. Passing it in avoids re-deriving it per
     *  circle. */
    radiusKm: number;
}

/**
 * Keep only circles that have *some* part inside the playable region.
 *
 * The existing logic was `!turf.booleanWithin(circle, holedMask)` — a
 * circle is inside the holed mask iff every point of the circle is in
 * the world-minus-playable area, which means the circle has no overlap
 * with any playable region. So `!booleanWithin` keeps circles that
 * overlap at least partially with a playable region.
 *
 * We short-circuit with a bbox disjoint check against the bbox of the
 * playable region (the holes). A circle whose bbox doesn't touch the
 * playable bbox definitely lies entirely in the mask and is dropped
 * without invoking booleanWithin.
 */
export function cullCirclesAgainstZone(
    circles: StationCircle[],
    { playableBbox, unionizedMask, radiusKm }: CullOptions,
): StationCircle[] {
    const out: StationCircle[] = [];
    for (const circle of circles) {
        // Cheap prefilter: if there's no playable region at all, keep
        // nothing. (Defensive — typically playableBbox is non-null.)
        if (!playableBbox) continue;

        const center = turf.getCoord(circle.properties);
        const cBbox = cheapCircleBbox(center[0], center[1], radiusKm);
        if (bboxesDisjoint(cBbox, playableBbox)) continue;

        if (!turf.booleanWithin(circle, unionizedMask)) {
            out.push(circle);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Phase B: question-driven filters
// ---------------------------------------------------------------------------

export type ToastFn = typeof toastFn;

function normalizedDisabledFacilityRefsForCache(
    data: MatchingQuestion,
): string[] {
    const refs = (data as MatchingQuestionWithFacilityOsmRefs)
        .disabledFacilityOsmRefs;
    return [...(refs ?? [])]
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .sort();
}

/**
 * Stable cache key for Voronoi-style matching. Zone-scoped types share one
 * Overpass result per territory + flags (seeker lat/lng does not affect
 * {@link findMatchingPlaces} for airport / major-city / *-full).
 */
export function matchingFacilityCacheKey(
    data: MatchingQuestion,
    zoneKey: string,
): string {
    if (data.type === "airport") {
        return JSON.stringify({
            type: data.type,
            zone: zoneKey,
            activeOnly: data.activeOnly === true,
            disabledAirports: [...(data.disabledAirportIatas ?? [])]
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean)
                .sort(),
        });
    }
    if (data.type === "major-city") {
        return JSON.stringify({
            type: data.type,
            zone: zoneKey,
            disabledFacilities: normalizedDisabledFacilityRefsForCache(data),
        });
    }
    if (typeof data.type === "string" && data.type.endsWith("-full")) {
        return JSON.stringify({
            type: data.type,
            zone: zoneKey,
            disabledFacilities: normalizedDisabledFacilityRefsForCache(data),
        });
    }
    if (data.type === "custom-points") {
        return JSON.stringify({
            type: data.type,
            lat: data.lat,
            lng: data.lng,
            geo: data.geo,
        });
    }
    return JSON.stringify({
        type: data.type,
        zone: zoneKey,
    });
}

/**
 * One-shot guard for airport single-point refreshes. This prevents calling
 * `findMatchingPlaces` on every filter pass when an airport key currently
 * resolves to exactly one point.
 *
 * Capped at MAX_AIRPORT_REFRESH_KEYS entries; when full the oldest entry is
 * evicted before insertion (ES6 Sets iterate in insertion order). This bounds
 * memory in long sessions where the user visits many different territories.
 */
const airportSingleRefreshAttemptedKeys = new Set<string>();
const MAX_AIRPORT_REFRESH_KEYS = 100;

function airportRefreshAttempted(key: string): boolean {
    return airportSingleRefreshAttemptedKeys.has(key);
}

function markAirportRefreshAttempted(key: string): void {
    if (airportSingleRefreshAttemptedKeys.has(key)) return;
    if (airportSingleRefreshAttemptedKeys.size >= MAX_AIRPORT_REFRESH_KEYS) {
        // Delete the oldest entry (first in iteration order).
        const oldest = airportSingleRefreshAttemptedKeys.values().next().value;
        if (oldest !== undefined)
            airportSingleRefreshAttemptedKeys.delete(oldest);
    }
    airportSingleRefreshAttemptedKeys.add(key);
}


function isVoronoiMatchingType(data: Question["data"]): boolean {
    if (!data || typeof data !== "object" || !("type" in data)) return false;
    const t = (data as { type: string }).type;
    if (t === "airport" || t === "major-city" || t === "custom-points")
        return true;
    return typeof t === "string" && t.endsWith("-full");
}

function normalizeMatchingPointsToFc(
    raw:
        | FeatureCollection<Point>
        | Feature<Point>
        | Feature<Point>[]
        | null
        | undefined,
): FeatureCollection<Point> {
    if (!raw) return turf.featureCollection([]);
    if (Array.isArray(raw)) return turf.featureCollection(raw);
    if (raw.type === "FeatureCollection")
        return raw as FeatureCollection<Point>;
    if (raw.type === "Feature") {
        return turf.featureCollection([raw as Feature<Point>]);
    }
    return turf.featureCollection([]);
}

/**
 * Pre-fetch facility point sets used by Voronoi matching questions so
 * {@link applyQuestionFilters} can classify each hiding circle by nearest
 * site (same logic as {@link findMatchingPlaces} / map Voronoi).
 */
export async function prefetchMatchingFacilityPoints(
    questions: Question[],
    zoneKey: string,
): Promise<Map<string, FeatureCollection<Point>>> {
    const unique = new Map<string, MatchingQuestion>();
    for (const q of questions) {
        if (q.id !== "matching") continue;
        if (!isVoronoiMatchingType(q.data)) continue;
        const key = matchingFacilityCacheKey(
            q.data as MatchingQuestion,
            zoneKey,
        );
        if (!unique.has(key)) unique.set(key, q.data as MatchingQuestion);
    }
    if (unique.size === 0) return new Map();

    const entries = await Promise.all(
        [...unique.entries()].map(async ([key, mq]) => {
            const raw = await findMatchingPlaces(mq);
            return [key, normalizeMatchingPointsToFc(raw)] as const;
        }),
    );
    return new Map(entries);
}

export interface ApplyQuestionFiltersOptions {
    circles: StationCircle[];
    questions: Question[];
    /** Pre-fetched POI feature collections keyed by
     *  `QuestionSpecificLocation` tag string. Populated by
     *  {@link prefetchMeasuringPoiPoints} so we don't serialize one
     *  Overpass fetch per measuring question. */
    measuringPoiCache: Map<string, FeatureCollection<any>>;
    /** Pre-fetched points for Voronoi-style matching; keyed by
     *  {@link matchingFacilityCacheKey} with this zone suffix. */
    matchingFacilityCache?: Map<string, FeatureCollection<Point>>;
    /** Territory key aligned with {@link prefetchMatchingFacilityPoints}. */
    matchingZoneKey: string;
    hidingRadius: number;
    useCustomStations: boolean;
    includeDefaultStations: boolean;
    /** When true, draggable-in-planning-mode questions are skipped. */
    planningModeEnabled: boolean;
    /** Optional toast hook for user-visible warnings. No-ops if absent
     *  (e.g. in tests). */
    toast?: ToastFn;
    /** Hook used to resolve OSM train-line nodes. Swappable for tests. */
    resolveTrainLineNodes?: (
        osmIdPath: string,
        lineRef?: string,
        aroundLatLng?: { latitude: number; longitude: number },
    ) => Promise<{
        nodeIds: number[];
        stops: { lat: number; lon: number; nameKey: string }[];
    }>;
    /**
     * OSM admin / letter / custom zone geometry for zone-style matching.
     * Defaults to {@link determineMatchingBoundary}. Swappable for tests.
     */
    resolveMatchingAdminRegion?: (
        data: MatchingQuestion,
    ) => Promise<Feature<Polygon | MultiPolygon> | null>;
}

/**
 * Maximum distance, in meters, between an OSM route stop and a hiding-zone
 * station for them to be considered the same physical place. OSM mapping
 * routinely puts the `railway=station` point and the `public_transport=
 * stop_position` point of one station 50-150 m apart; a couple-hundred-meter
 * tolerance covers that without collapsing genuinely distinct stations on
 * the same line (the closest pairs in dense networks like NYC are ~400 m).
 */
const TRAIN_LINE_STOP_PROXIMITY_METERS = 250;
const MATCHING_ADMIN_REGION_RETRY_ATTEMPTS = 3;
const MATCHING_ADMIN_REGION_RETRY_DELAY_MS = 300;
const AIRPORT_DEBUG_QUERY_PARAM = "debugAirportMatching";
const AIRPORT_DEBUG_LOCALSTORAGE_KEY = "jl-debug-airport-matching";

function airportDebugEnabled(): boolean {
    if (typeof window === "undefined") return false;
    const fromQuery = new URLSearchParams(window.location.search).get(
        AIRPORT_DEBUG_QUERY_PARAM,
    );
    if (fromQuery === "1" || fromQuery === "true") return true;
    try {
        const fromStorage = window.localStorage.getItem(
            AIRPORT_DEBUG_LOCALSTORAGE_KEY,
        );
        return fromStorage === "1" || fromStorage === "true";
    } catch {
        return false;
    }
}

async function retryResolveMatchingAdminRegion(
    resolveMatchingAdminRegion: (
        data: MatchingQuestion,
    ) => Promise<Feature<Polygon | MultiPolygon> | null>,
    data: MatchingQuestion,
): Promise<Feature<Polygon | MultiPolygon> | null> {
    let lastError: unknown;
    for (
        let attempt = 0;
        attempt < MATCHING_ADMIN_REGION_RETRY_ATTEMPTS;
        attempt++
    ) {
        try {
            return await resolveMatchingAdminRegion(data);
        } catch (error) {
            lastError = error;
            if (attempt < MATCHING_ADMIN_REGION_RETRY_ATTEMPTS - 1) {
                const delayMs =
                    MATCHING_ADMIN_REGION_RETRY_DELAY_MS * 2 ** attempt;
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
    throw lastError;
}

function boundaryToPolygonFeature(
    boundary: unknown,
): Feature<Polygon | MultiPolygon> | null {
    if (boundary === false || boundary == null) return null;
    if (typeof boundary !== "object") return null;
    const b = boundary as
        | Feature<Polygon | MultiPolygon>
        | FeatureCollection<Polygon | MultiPolygon>;
    if ("geometry" in b && b.geometry) {
        const t = b.geometry.type;
        if (t === "Polygon" || t === "MultiPolygon") {
            return b as Feature<Polygon | MultiPolygon>;
        }
        return null;
    }
    if ("features" in b && Array.isArray(b.features) && b.features.length > 0) {
        const u = safeUnion(b);
        if (
            u &&
            typeof u === "object" &&
            "geometry" in u &&
            u.geometry &&
            (u.geometry.type === "Polygon" ||
                u.geometry.type === "MultiPolygon")
        ) {
            return u as Feature<Polygon | MultiPolygon>;
        }
    }
    return null;
}

async function defaultResolveMatchingAdminRegion(
    data: MatchingQuestion,
): Promise<Feature<Polygon | MultiPolygon> | null> {
    const raw = await determineMatchingBoundary(
        data,
        DEFAULT_ADMIN_BOUNDARY_OVERPASS_TIMEOUT_SEC,
    );
    return boundaryToPolygonFeature(raw);
}

/**
 * Voronoi cell that owns the seeker pin. Prefer point-in-polygon; if the
 * seeker falls through (projection gaps, boundaries, numeric issues), use
 * the cell for the {@link turf.nearestPoint} airport — otherwise we skip
 * airport matching entirely and every station stays visible.
 */
/**
 * Zone-style matching (admin polygon, zip, custom zone, …): use the full
 * hiding disk, not just the station center. A disk that straddles a border
 * can satisfy "Same" via partial overlap and "Different" if any part leaves
 * the seeker's region; center-only tests drop those incorrectly.
 */
function stationCircleMatchesResolvedRegion(
    circle: StationCircle,
    region: Feature<Polygon | MultiPolygon>,
    wantSame: boolean,
): boolean {
    const disk = circle as Feature<Polygon | MultiPolygon>;
    if (wantSame) {
        return turf.booleanIntersects(disk, region);
    }
    return !turf.booleanWithin(disk, region);
}

function voronoiCellForSeeker(
    seekerPoint: Feature<Point>,
    voronoiFc: FeatureCollection<Polygon | MultiPolygon>,
    airportPoints: FeatureCollection<Point>,
): Feature<Polygon | MultiPolygon> | undefined {
    for (const cell of voronoiFc.features) {
        if (
            cell.geometry &&
            turf.booleanPointInPolygon(
                seekerPoint,
                cell as Feature<Polygon | MultiPolygon>,
            )
        ) {
            return cell as Feature<Polygon | MultiPolygon>;
        }
    }

    if (airportPoints.features.length === 0) return undefined;

    const nearestAirport = turf.nearestPoint(seekerPoint, airportPoints);
    const [nx, ny] = nearestAirport.geometry.coordinates;
    const coordNear = (a: number, b: number) => Math.abs(a - b) < 1e-8;

    return voronoiFc.features.find((cell) => {
        const c = (
            cell.properties as { site?: Feature<Point> } | null | undefined
        )?.site?.geometry?.coordinates as [number, number] | undefined;
        if (!c) return false;
        return coordNear(c[0], nx) && coordNear(c[1], ny);
    }) as Feature<Polygon | MultiPolygon> | undefined;
}

/** Cheap haversine — avoids spinning up turf.point for every circle/stop pair. */
function haversineMeters(
    aLat: number,
    aLon: number,
    bLat: number,
    bLon: number,
): number {
    const R = 6_371_000;
    const toRad = Math.PI / 180;
    const dLat = (bLat - aLat) * toRad;
    const dLon = (bLon - aLon) * toRad;
    const lat1 = aLat * toRad;
    const lat2 = bLat * toRad;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatNearestDistribution(
    nearestCounts: ReadonlyMap<string, number>,
): string {
    const formatted = [...nearestCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => `${label}: ${count}`)
        .join(", ");
    return formatted || "none";
}

/**
 * Apply every active matching/measuring filter to the circle set. Pure
 * in its inputs — async work: `resolveTrainLineNodes` (train-line),
 * `resolveMatchingAdminRegion` (admin / letter / custom zone), and
 * `determineMatchingBoundary` by default for the latter.
 *
 * Question ids handled here: `matching` (several types), `measuring`
 * (McDonald’s / 7-Eleven only). Other ids (`radius`, `thermometer`,
 * `tentacles`) affect map overlays / other flows but do not cull hiding-
 * zone stations — add there before expecting dots to follow them.
 */
export async function applyQuestionFilters({
    circles,
    questions,
    measuringPoiCache,
    matchingFacilityCache = new Map(),
    matchingZoneKey,
    hidingRadius,
    useCustomStations,
    includeDefaultStations,
    planningModeEnabled,
    toast,
    resolveTrainLineNodes = trainLineNodeFinder,
    resolveMatchingAdminRegion = defaultResolveMatchingAdminRegion,
}: ApplyQuestionFiltersOptions): Promise<StationCircle[]> {
    let current = circles;
    // Keep a stable reference set for seeker-side lookups so matching
    // questions don't drift when earlier filters trim `current`.
    const seekerReferenceCircles = circles;

    for (const question of questions) {
        if (planningModeEnabled && question.data.drag) continue;

        if (
            question.id === "matching" &&
            isVoronoiMatchingType(question.data)
        ) {
            if (current.length === 0) break;

            const key = matchingFacilityCacheKey(
                question.data as MatchingQuestion,
                matchingZoneKey,
            );
            let points = matchingFacilityCache.get(key);
            if (!points || points.features.length === 0) {
                // Race guard: question objects are mutable and can change while
                // prefetching. If a key misses here, do an on-demand fetch with
                // the current question state so we don't emit false "no points"
                // warnings for valid airport/facility datasets.
                const raw = await findMatchingPlaces(
                    question.data as MatchingQuestion,
                );
                points = normalizeMatchingPointsToFc(raw);
                matchingFacilityCache.set(key, points);
            }
            if (
                question.data.type === "airport" &&
                points.features.length === 1
            ) {
                if (!airportRefreshAttempted(key)) {
                    try {
                        const raw = await findMatchingPlaces(
                            question.data as MatchingQuestion,
                        );
                        const refreshed = normalizeMatchingPointsToFc(raw);
                        // Only guard the key after a successful fetch so
                        // transient network errors stay retryable.
                        markAirportRefreshAttempted(key);
                        if (
                            refreshed.features.length > points.features.length
                        ) {
                            points = refreshed;
                            matchingFacilityCache.set(key, points);
                        }
                    } catch (err) {
                        // Leave key unguarded; the next filter pass can retry.
                        console.warn(
                            "[airport-matching] single-point refresh failed; will retry next pass",
                            err,
                        );
                    }
                }
            }
            if (!points || points.features.length === 0) {
                // Airports have a dedicated empty-state toast in matching flows.
                // Suppress the generic Voronoi warning here to avoid duplicate
                // noisy dialogs for the same condition.
                if (question.data.type !== "airport") {
                    toast?.warning(
                        "Voronoi matching has no facility points (still loading or empty territory). That filter was skipped.",
                        { toastId: "voronoi-matching-no-points" },
                    );
                }
                continue;
            }

            const seekerPoint = turf.point([
                question.data.lng,
                question.data.lat,
            ]);
            const airportFc = points as FeatureCollection<Point>;
            const voronoiFc = geoSpatialVoronoi(airportFc);
            const seekerCell = voronoiCellForSeeker(
                seekerPoint,
                voronoiFc,
                airportFc,
            );
            if (!seekerCell?.geometry) {
                toast?.warning(
                    "Could not place the seeker in any Voronoi cell for this matching question; that filter was skipped.",
                    { toastId: "voronoi-matching-no-cell" },
                );
                continue;
            }

            const wantSame = question.data.same === true;
            if (question.data.type === "airport") {
                const seekerNearest = turf.nearestPoint(
                    seekerPoint,
                    airportFc as any,
                );
                const seekerIata = String(
                    (seekerNearest.properties as { iata?: string } | null)
                        ?.iata ?? "",
                )
                    .trim()
                    .toUpperCase();
                const [sx, sy] = seekerNearest.geometry.coordinates;
                const airportKey = (iata: string, x: number, y: number) =>
                    iata.length > 0 ? `iata:${iata}` : `coord:${x},${y}`;
                const airportLabel = (iata: string, x: number, y: number) =>
                    iata.length > 0 ? iata : `${x.toFixed(4)},${y.toFixed(4)}`;

                const seekerKey = airportKey(seekerIata, sx, sy);
                const nearestCounts = new Map<string, number>();
                const next = current.filter((circle) => {
                    const stationPoint = turf.point(
                        turf.getCoord(circle.properties as Feature<Point>),
                    );
                    const nearestForStation = turf.nearestPoint(
                        stationPoint,
                        airportFc as any,
                    );
                    const stationIata = String(
                        (
                            nearestForStation.properties as {
                                iata?: string;
                            } | null
                        )?.iata ?? "",
                    )
                        .trim()
                        .toUpperCase();
                    const [nx, ny] = nearestForStation.geometry.coordinates;
                    const stationKey = airportKey(stationIata, nx, ny);
                    const stationLabel = airportLabel(stationIata, nx, ny);
                    nearestCounts.set(
                        stationLabel,
                        (nearestCounts.get(stationLabel) ?? 0) + 1,
                    );
                    const sameRegion = stationKey === seekerKey;
                    return wantSame ? sameRegion : !sameRegion;
                });
                if (!wantSame && current.length > 0 && next.length === 0) {
                    const distribution =
                        formatNearestDistribution(nearestCounts);
                    toast?.info(
                        `All current hiding stations are nearest to the same airport as your seeker pin, so 'Different' leaves no stations. Distribution: ${distribution}.`,
                        { toastId: "matching-airport-different-empty" },
                    );
                }
                if (airportDebugEnabled()) {
                    const distribution =
                        formatNearestDistribution(nearestCounts);
                    console.info(
                        "[airport-matching]",
                        JSON.stringify({
                            mode: wantSame ? "same" : "different",
                            seekerAirport: airportLabel(seekerIata, sx, sy),
                            enabledAirports: airportFc.features.length,
                            stationsBefore: current.length,
                            stationsAfter: next.length,
                            distribution,
                        }),
                    );
                }
                current = next;
                continue;
            }

            const next = current.filter((circle) => {
                const seekerRegion = seekerCell as Feature<
                    Polygon | MultiPolygon
                >;
                const stationPoint = turf.point(
                    turf.getCoord(circle.properties as Feature<Point>),
                );
                const inSeekerRegion = turf.booleanPointInPolygon(
                    stationPoint,
                    seekerRegion,
                );

                if (wantSame) {
                    return inSeekerRegion;
                }

                return !inSeekerRegion;
            });
            current = next;
        }

        if (
            question.id === "matching" &&
            (question.data.type === "zone" ||
                question.data.type === "same-admin-zone" ||
                question.data.type === "letter-zone" ||
                question.data.type === "same-landmass" ||
                question.data.type === "same-zip" ||
                question.data.type === "same-district" ||
                question.data.type === "custom-zone")
        ) {
            if (current.length === 0) break;

            const data = question.data as MatchingQuestion;
            let resolvedRegion: Feature<Polygon | MultiPolygon> | null;
            try {
                resolvedRegion = await retryResolveMatchingAdminRegion(
                    resolveMatchingAdminRegion,
                    data,
                );
            } catch {
                toast?.warning(
                    "Could not load a zone matching boundary; skipping that filter.",
                );
                continue;
            }
            if (!resolvedRegion) {
                toast?.warning(
                    "No zone geometry for a matching question; skipping that filter.",
                );
                continue;
            }
            const regionNonNull = resolvedRegion;

            const wantSame = data.same === true;
            const beforeZone = current.length;
            const zoneFiltered = current.filter((circle) =>
                stationCircleMatchesResolvedRegion(
                    circle,
                    regionNonNull,
                    wantSame,
                ),
            );
            // Hiding disks can skim admin borders and satisfy questions in
            // non-obvious ways; if this step would remove everyone, skip it so
            // the seeker is not stuck with an empty map.
            if (beforeZone > 0 && zoneFiltered.length === 0) {
                toast?.info(
                    wantSame
                        ? 'That "same zone" match would remove every remaining station (disks can straddle borders). The filter was skipped — move the seeker pin, try another question, or adjust hiding radius.'
                        : 'That "different zone" match would remove every remaining station (every disk lies fully inside the matched area). The filter was skipped — move the seeker pin, try another question, or adjust hiding radius.',
                    {
                        toastId: wantSame
                            ? "matching-zone-same-skipped-empty"
                            : "matching-zone-different-skipped-empty",
                    },
                );
                continue;
            }
            current = zoneFiltered;
        }

        if (
            question.id === "matching" &&
            (question.data.type === "same-first-letter-station" ||
                question.data.type === "same-length-station" ||
                question.data.type === "same-train-line")
        ) {
            if (current.length === 0) break;

            const location = turf.point([question.data.lng, question.data.lat]);

            const nearestTrainStation = turf.nearestPoint(
                location,
                turf.featureCollection(
                    seekerReferenceCircles.map((x) => x.properties),
                ) as any,
            );

            if (question.data.type === "same-train-line") {
                if (useCustomStations && !includeDefaultStations) {
                    toast?.warning(
                        "'Same train line' isn't supported with custom-only station lists; skipping this filter.",
                    );
                    continue;
                } else {
                    const nid = nearestTrainStation.properties.id as
                        | string
                        | undefined;
                    if (!nid || !nid.includes("/")) {
                        toast?.warning(
                            "Nearest station has no OSM id; skipping 'same train line' filter.",
                        );
                        continue;
                    }

                    const trainLineRef = question.data.lineRef ?? "";
                    const wantSameTrainLine = question.data.same;

                    const { nodeIds, stops } = await resolveTrainLineNodes(
                        nid,
                        trainLineRef,
                        {
                            latitude: question.data.lat,
                            longitude: question.data.lng,
                        },
                    );

                    const nodeIdSet = new Set(nodeIds);
                    const osmNameKeys = new Set(
                        stops.map((s) => s.nameKey).filter(Boolean),
                    );
                    // Cheap to fetch (already cached by line ref) and only
                    // used when neither OSM source can answer for a circle.
                    const gtfsNames =
                        await getGtfsStationNamesForLineRef(trainLineRef);

                    const haveAnySignal =
                        nodeIdSet.size > 0 ||
                        stops.length > 0 ||
                        osmNameKeys.size > 0 ||
                        gtfsNames.size > 0;
                    if (!haveAnySignal) {
                        // Nothing usable from OSM nodes, OSM geometry, OSM
                        // names, or GTFS. Don't silently zero out the zone —
                        // keep `current` and warn so the user knows the
                        // filter was a no-op (same/different both unsafe).
                        toast?.warning(
                            `No train line data found for ${extractStationName(
                                nearestTrainStation,
                            )}; skipping 'same train line' filter.`,
                        );
                        continue;
                    }

                    /** OR across every available signal. The previous
                     *  layered approach only worked for "Same" (where an
                     *  empty result meant "fall through to the next
                     *  signal"); under "Different" tier 1 silently
                     *  short-circuited because !nodeIdSet.has(id) was true
                     *  for nearly every circle (zone circles use
                     *  railway=station ids while route relations reference
                     *  stop_position ids), so 7-line stops survived. A
                     *  single union predicate lets one negation handle both
                     *  directions correctly. */
                    const isOnLine = (circle: StationCircle): boolean => {
                        const idProp = circle.properties.properties.id;
                        if (idProp && idProp.includes("/")) {
                            const id = parseInt(idProp.split("/")[1], 10);
                            if (!Number.isNaN(id) && nodeIdSet.has(id)) {
                                return true;
                            }
                        }

                        if (stops.length > 0) {
                            const coord =
                                circle.properties.geometry.coordinates;
                            if (coord && coord.length >= 2) {
                                const [lon, lat] = coord;
                                for (const stop of stops) {
                                    if (
                                        haversineMeters(
                                            lat,
                                            lon,
                                            stop.lat,
                                            stop.lon,
                                        ) <= TRAIN_LINE_STOP_PROXIMITY_METERS
                                    ) {
                                        return true;
                                    }
                                }
                            }
                        }

                        // Name-only signals are last because they can't
                        // disambiguate homonyms (e.g. "111 St" on J vs 7).
                        // We still consult them when geometry is missing
                        // entirely (e.g. Overpass returned route metadata
                        // but no stop coords, or only GTFS is available).
                        const stationName = extractStationName(
                            circle.properties,
                        );
                        if (stationName) {
                            const key = stationNameMatchKey(stationName);
                            if (key) {
                                if (
                                    stops.length === 0 &&
                                    osmNameKeys.size > 0 &&
                                    osmNameKeys.has(key)
                                ) {
                                    return true;
                                }
                                if (
                                    nodeIdSet.size === 0 &&
                                    stops.length === 0 &&
                                    gtfsNames.size > 0 &&
                                    gtfsNames.has(key)
                                ) {
                                    return true;
                                }
                            }
                        }

                        return false;
                    };

                    current = current.filter((circle) => {
                        const onLine = isOnLine(circle);
                        return wantSameTrainLine ? onLine : !onLine;
                    });
                }
            }

            const englishName = extractStationName(nearestTrainStation);
            if (!englishName) {
                toast?.error(
                    "Nearest station has no name; skipping letter/length station matching for this question.",
                    { toastId: "station-matching-no-name" },
                );
                continue;
            }

            if (question.data.type === "same-first-letter-station") {
                const letter = englishName[0].toUpperCase();
                current = current.filter((circle) => {
                    const name = extractStationName(circle.properties);
                    if (!name) return false;
                    return question.data.same
                        ? name[0].toUpperCase() === letter
                        : name[0].toUpperCase() !== letter;
                });
            } else if (question.data.type === "same-length-station") {
                const seekerLength = englishName.length;
                const comparison = question.data.lengthComparison;
                current = current.filter((circle) => {
                    const name = extractStationName(circle.properties);
                    if (!name) return false;
                    if (comparison === "same")
                        return name.length === seekerLength;
                    if (comparison === "shorter")
                        return name.length < seekerLength;
                    if (comparison === "longer")
                        return name.length > seekerLength;
                    return false;
                });
            }
        }

        if (
            question.id === "measuring" &&
            (question.data.type === "mcdonalds" ||
                question.data.type === "seven11")
        ) {
            if (current.length === 0) break;

            const key =
                question.data.type === "mcdonalds"
                    ? QuestionSpecificLocation.McDonalds
                    : QuestionSpecificLocation.Seven11;
            const points = measuringPoiCache.get(String(key));
            if (!points) {
                toast?.warning(
                    "Measuring question has no POI data yet (still loading). That filter was skipped.",
                    { toastId: `measuring-poi-missing-${key}` },
                );
                continue;
            }

            const seekerPoint = turf.point([
                question.data.lng,
                question.data.lat,
            ]);
            const seekerNearest = turf.nearestPoint(seekerPoint, points as any);
            const seekerDistance = turf.distance(
                seekerPoint,
                seekerNearest as any,
                { units: "miles" },
            );

            current = current.filter((circle) => {
                const point = turf.point(turf.getCoord(circle.properties));
                const nearest = turf.nearestPoint(point, points as any);
                const d = turf.distance(point, nearest as any, {
                    units: "miles",
                });
                return question.data.hiderCloser
                    ? d < seekerDistance + hidingRadius
                    : d > seekerDistance - hidingRadius;
            });
        }
    }

    return current;
}

/**
 * Collect the distinct POI sets needed by this batch of questions, in
 * parallel. Deduplicates: if two questions both need `mcdonalds` we
 * only fire one Overpass request.
 */
export async function prefetchMeasuringPoiPoints(
    questions: Question[],
): Promise<Map<string, FeatureCollection<any>>> {
    const wanted = new Set<string>();
    for (const q of questions) {
        if (q.id !== "measuring") continue;
        if (q.data.type === "mcdonalds") {
            wanted.add(String(QuestionSpecificLocation.McDonalds));
        } else if (q.data.type === "seven11") {
            wanted.add(String(QuestionSpecificLocation.Seven11));
        }
    }

    if (wanted.size === 0) return new Map();

    const entries = await Promise.all(
        [...wanted].map(async (tag) => {
            const pts = await findPlacesSpecificInZone(tag as any);
            return [tag, pts] as const;
        }),
    );
    return new Map(entries);
}

// ---------------------------------------------------------------------------
// Phase B: reachability filter (GTFS / RAPTOR)
// ---------------------------------------------------------------------------

/** Per-station override from the user. */
export type ReachabilityOverride = "include" | "exclude";

/** Classification of a circle against the reachability result. */
export type ReachabilityStatus = "reachable" | "unreachable" | "unknown";

export interface ReachabilityFilterOptions {
    circles: StationCircle[];
    /** OSM→GTFS match table keyed by OSM id (as stored on each place). */
    matches: ReadonlyMap<string, MatchedStation>;
    /** Arrival times from the worker, seconds since departure. */
    arrivalsByStopId: ReadonlyMap<string, number>;
    /** Complete stop table used for parent/platform fallback in arrivals
     *  lookup. Generally the `byId` map of the StopIndex used to build
     *  `matches`. */
    stopById: ReadonlyMap<string, TransitStop>;
    /** Hard cap, minutes, matching the query budget. Circles whose
     *  arrival seconds exceed this are classified "unreachable". */
    budgetMinutes: number;
    /** Per-OSM-id force include / exclude; wins over any automatic
     *  classification. */
    overrides?: ReadonlyMap<string, ReachabilityOverride>;
    /** Decides what to do with circles that have no match in `matches`.
     *  "include" is the sensible default so mis-named or newly opened
     *  stations aren't silently dropped. */
    unknownDefault?: "include" | "exclude";
}

export interface ReachabilityFilterResult {
    /** Circles that survive. */
    filtered: StationCircle[];
    /** OSM id → status, for every input circle (useful for marker
     *  coloring in Phase 4). */
    classifications: Map<string, ReachabilityStatus>;
}

/**
 * Extract the OSM id a circle carries in its `properties` chain.
 * `StationCircle` is a `turf.circle(...)` whose outer properties are the
 * originating `StationPlace` (a GeoJSON Feature<Point>); the OSM id
 * lives at `circle.properties.properties.id`.
 */
function osmIdFromCircle(circle: StationCircle): string | undefined {
    const id = circle.properties?.properties?.id;
    return typeof id === "string" ? id : undefined;
}

/**
 * Split a circle set into reachable / unreachable / unknown using the
 * given OSM↔GTFS matches and a RAPTOR arrivals map. Pure; no store or
 * network access. Overrides are consulted last and always win.
 *
 * Rules:
 *   - No match found → "unknown". Kept iff unknownDefault is "include"
 *     (unless an override says otherwise).
 *   - Match found and stop has an arrival within budget → "reachable".
 *   - Match found and stop has no arrival / arrival > budget →
 *     "unreachable". Dropped unless override "include".
 */
export function filterCirclesByReachability({
    circles,
    matches,
    arrivalsByStopId,
    stopById,
    budgetMinutes,
    overrides,
    unknownDefault = "include",
}: ReachabilityFilterOptions): ReachabilityFilterResult {
    const budgetSec = budgetMinutes * 60;
    const filtered: StationCircle[] = [];
    const classifications = new Map<string, ReachabilityStatus>();

    for (const circle of circles) {
        const osmId = osmIdFromCircle(circle);
        // Circles with no recoverable OSM id (e.g. from custom imports
        // that didn't set one) can't be matched — treat as unknown.
        const match = osmId ? matches.get(osmId) : undefined;

        let status: ReachabilityStatus;
        if (!match || !match.best) {
            status = "unknown";
        } else {
            const arrival = lookupArrivalWithParentFallback(
                match.best.stopId,
                arrivalsByStopId,
                stopById as Map<string, TransitStop>,
            );
            status =
                arrival !== undefined && arrival <= budgetSec
                    ? "reachable"
                    : "unreachable";
        }

        if (osmId) classifications.set(osmId, status);

        const override = osmId ? overrides?.get(osmId) : undefined;
        const keep =
            override === "include"
                ? true
                : override === "exclude"
                  ? false
                  : status === "reachable" ||
                    (status === "unknown" && unknownDefault === "include");

        if (keep) filtered.push(circle);
    }

    return { filtered, classifications };
}

// ---------------------------------------------------------------------------
// Render-side helpers
// ---------------------------------------------------------------------------

/**
 * Stable signature for a set of station circles, used as a memoization
 * key for `styleStations` so toggling unrelated stores doesn't force a
 * fresh `turf.union` over every circle.
 */
export function stationsSignature(
    circles: StationCircle[],
    radius: number,
    units: string,
): string {
    if (circles.length === 0) return `0|${radius}|${units}`;
    // Sort ids so re-ordering doesn't invalidate the key.
    const ids = circles
        .map((c) => c.properties.properties.id)
        .sort()
        .join(",");
    return `${circles.length}|${radius}|${units}|${ids}`;
}
