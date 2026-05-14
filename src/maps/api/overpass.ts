import * as turf from "@turf/turf";
import type {
    BBox,
    Feature,
    FeatureCollection,
    LineString,
    MultiLineString,
    MultiPolygon,
    Polygon,
} from "geojson";

/**
 * Server-side Overpass timeout (seconds) for heavy admin-boundary queries
 * (`is_in` + relation `out geom`, letter-zone relation searches). Public so
 * call sites can align with {@link findAdminBoundary} / matching flows.
 */
export const DEFAULT_ADMIN_BOUNDARY_OVERPASS_TIMEOUT_SEC = 120;

/** GET URLs longer than this often fail (browser/proxy limits); use POST instead. */
const MAX_OVERPASS_GET_URL_LENGTH = 7500;
/** One Overpass query with many `map_to_area` blocks is slow and RAM-heavy; split beyond this. */
const MULTI_AREA_SPLIT_THRESHOLD = 4;
/** Avoid too many concurrent Overpass requests per batch (429s spike at 4+). */
const MULTI_AREA_PARALLEL_CHUNK = 2;
/** Pause between multi-area batches so mirrors are not hammered back-to-back. */
const MULTI_AREA_CHUNK_GAP_MS = 700;
/** Keep `poly:"…"` clauses small enough for GET and faster server-side evaluation. */
const MAX_POLY_INLINE_LENGTH = 5200;

/** HTTP statuses where delayed retry sometimes succeeds (busy / rate-limited Overpass). */
const OVERPASS_RETRYABLE_HTTP = new Set([408, 429, 502, 503, 504, 529, 599]);
const OVERPASS_RETRY_DELAY_MS = 3500;
const OVERPASS_429_MIN_RETRY_MS = 9000;
const OVERPASS_MAX_RETRIES = 4;
import { toast } from "react-toastify";

import {
    additionalMapGeoLocations,
    mapGeoJSON,
    mapGeoLocation,
    playableTerritoryUnion,
    polyGeoJSON,
} from "@/lib/context";
import { stationNameMatchKey } from "@/lib/transit/osm-gtfs-match";
import { cacheFetch, determineCache } from "@/maps/api/cache";
import {
    LOCATION_FIRST_TAG,
    NOMINATIM_API,
    OVERPASS_API,
    OVERPASS_INTERPRETER_URLS,
} from "@/maps/api/constants";
import osmtogeojson from "@/maps/api/osm-to-geojson";
import type {
    EncompassingTentacleQuestionSchema,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
    QuestionSpecificLocation,
} from "@/maps/api/types";
import { CacheType } from "@/maps/api/types";
import { safeUnion } from "@/maps/geo-utils/operators";

/** Drop OSM elements whose center is outside the post–question-apply playable union. */
export function filterOsmElementsToPlayableTerritory(
    elements: any[],
    territory: Feature<Polygon | MultiPolygon> | null | undefined,
): any[] {
    if (!territory?.geometry || !elements.length) return elements;
    return elements.filter((el: any) => {
        const lon = el.center ? el.center.lon : el.lon;
        const lat = el.center ? el.center.lat : el.lat;
        if (typeof lon !== "number" || typeof lat !== "number") return false;
        return turf.booleanPointInPolygon(
            turf.point([lon, lat]),
            territory as Feature<Polygon | MultiPolygon>,
        );
    });
}

function playableTerritoryKeySuffix(): string {
    const u = playableTerritoryUnion.get();
    if (!u?.geometry) return "";
    const b = turf.bbox(u as any);
    return `|pt:${b.map((x: number) => x.toFixed(4)).join(",")}`;
}

function dedupeOsmElements(elements: any[]): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const el of elements) {
        if (!el || typeof el.type !== "string" || typeof el.id !== "number")
            continue;
        const k = `${el.type}\0${el.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(el);
    }
    return out;
}

/**
 * Build the lat/lon space-separated string for Overpass `poly:"…"` from a
 * feature collection, simplifying until the clause fits GET limits and
 * evaluates in reasonable time on the server.
 */
function polyClauseStringForOverpass(fc: FeatureCollection): string {
    const build = (c: FeatureCollection) =>
        turf
            .getCoords(c.features as any)
            .flatMap((polygon: any) => polygon.geometry.coordinates)
            .flat()
            .map((coord: number[]) => `${coord[1]} ${coord[0]}`)
            .join(" ");

    let tolerance = 0.00006;
    let current = fc;
    let str = build(current);
    let guard = 0;
    while (str.length > MAX_POLY_INLINE_LENGTH && guard++ < 28) {
        tolerance *= 1.35;
        current = turf.simplify(fc, {
            tolerance,
            highQuality: true,
        }) as FeatureCollection;
        str = build(current);
    }
    return str;
}

/**
 * Stable string for deduping Overpass-backed fetches that scope to the
 * current game territory (same inputs as {@link findPlacesInZone}).
 */
export function overpassZoneCacheKey(): string {
    const $polyGeoJSON = polyGeoJSON.get();
    const suffix = playableTerritoryKeySuffix();
    if ($polyGeoJSON) {
        return `poly:${polyClauseStringForOverpass($polyGeoJSON)}${suffix}`;
    }
    const primaryLocation = mapGeoLocation.get();
    const additionalLocations = additionalMapGeoLocations
        .get()
        .filter((entry) => entry.added)
        .map((entry) => entry.location);
    const all = [primaryLocation, ...additionalLocations];
    const ids = all
        .map(
            (loc) =>
                `${loc.properties?.osm_type ?? ""}:${loc.properties?.osm_id ?? ""}`,
        )
        .sort()
        .join("|");
    return `rel:${ids}${suffix}`;
}

// RFC7231 allows Retry-After as delta-seconds or an HTTP-date; we
// intentionally parse only delta-seconds because Overpass typically sends
// that form. Parse failures fall back to OVERPASS_429_MIN_RETRY_MS (for 429)
// and non-429 responses use OVERPASS_RETRY_DELAY_MS.
function overpassRetryDelayMs(status: number, response: Response): number {
    if (status === 429) {
        const ra = response.headers.get("Retry-After");
        if (ra) {
            const sec = Number.parseInt(ra, 10);
            if (Number.isFinite(sec) && sec > 0) {
                return Math.min(
                    120_000,
                    Math.max(OVERPASS_429_MIN_RETRY_MS, sec * 1000),
                );
            }
        }
        return OVERPASS_429_MIN_RETRY_MS;
    }
    return OVERPASS_RETRY_DELAY_MS;
}

const getOverpassData = async (
    query: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
    _retryCount = 0,
) => {
    const encodedQuery = encodeURIComponent(query);
    const primaryUrl = `${OVERPASS_API}?data=${encodedQuery}`;
    const usePost = primaryUrl.length > MAX_OVERPASS_GET_URL_LENGTH;

    const mirrorCachePut = async (res: Response) => {
        const cache = await determineCache(cacheType);
        await cache.put(primaryUrl, res.clone());
    };

    const fetchOverpassPostAllMirrors = async (): Promise<Response> => {
        const body = `data=${encodedQuery}`;
        let last = new Response("", {
            status: 599,
            statusText: "Network Error",
        });
        for (let i = 0; i < OVERPASS_INTERPRETER_URLS.length; i++) {
            const base = OVERPASS_INTERPRETER_URLS[i]!;
            const pending = (async () => {
                try {
                    return await fetch(base, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        body,
                    });
                } catch {
                    return new Response("", {
                        status: 599,
                        statusText: "Network Error",
                    });
                }
            })();
            last =
                loadingText && i === 0 && _retryCount === 0
                    ? await toast.promise(pending, { pending: loadingText })
                    : await pending;
            if (last.ok) {
                await mirrorCachePut(last);
                return last;
            }
        }
        return last;
    };

    let response: Response;

    const debugOverpassFailure = async (res: Response) => {
        let bodySnippet = "";
        try {
            bodySnippet = (await res.clone().text()).slice(0, 1200);
        } catch {
            /* ignore */
        }
        const payload = {
            status: res.status,
            statusText: res.statusText,
            query,
            bodySnippet,
            timestamp: new Date().toISOString(),
            usePost,
        };
        if (typeof window !== "undefined") {
            const w = window as Window & {
                __overpassDebug?: Array<typeof payload>;
            };
            if (!w.__overpassDebug) w.__overpassDebug = [];
            w.__overpassDebug.push(payload);
        }
        console.groupCollapsed(
            `[Overpass debug] ${res.status} ${res.statusText} (${usePost ? "POST" : "GET"})`,
        );
        console.log(payload);
        if (bodySnippet) console.log("body:", bodySnippet);
        console.groupEnd();
    };

    /**
     * `cacheFetch` turns `ERR_CONNECTION_CLOSED` into a 599 Response (no throw),
     * so we must iterate mirrors explicitly — the old try/catch never ran.
     */
    const fetchOverpassGetAllMirrors = async (): Promise<Response> => {
        let last = new Response("", {
            status: 599,
            statusText: "Network Error",
        });
        for (let i = 0; i < OVERPASS_INTERPRETER_URLS.length; i++) {
            const url = `${OVERPASS_INTERPRETER_URLS[i]}?data=${encodedQuery}`;
            last = await cacheFetch(
                url,
                i === 0 && _retryCount === 0 ? loadingText : undefined,
                cacheType,
            );
            if (last.ok) {
                if (i > 0) {
                    await mirrorCachePut(last);
                }
                return last;
            }
        }
        return last;
    };

    if (usePost) {
        const cache = await determineCache(cacheType);
        const cachedResponse = await cache.match(primaryUrl);
        if (cachedResponse?.ok) {
            response = cachedResponse.clone();
        } else {
            response = await fetchOverpassPostAllMirrors();
        }
    } else {
        response = await fetchOverpassGetAllMirrors();
    }

    if (!response.ok && !usePost) {
        // Some Overpass frontends/proxies return 400 for long/complex GET
        // query strings but accept the same payload via POST.
        const postRetryResponse = await fetchOverpassPostAllMirrors();
        if (postRetryResponse.ok) {
            response = postRetryResponse;
        }
    }

    if (!response.ok) {
        if (
            _retryCount < OVERPASS_MAX_RETRIES &&
            OVERPASS_RETRYABLE_HTTP.has(response.status)
        ) {
            const delay = overpassRetryDelayMs(response.status, response);
            await new Promise((r) => setTimeout(r, delay));
            return getOverpassData(
                query,
                loadingText,
                cacheType,
                _retryCount + 1,
            );
        }
        await debugOverpassFailure(response);
        const tries = _retryCount + 1;
        const hint =
            response.status === 504 || response.status === 502
                ? " Public Overpass servers time out on large queries; try a smaller territory or wait and retry."
                : response.status === 429
                  ? " Rate limited — wait a minute or reduce how many regions load at once."
                  : "";
        toast.error(
            `OpenStreetMap (Overpass) request failed after ${tries} attempt(s): ${response.status} ${response.statusText}.${hint}`,
            { autoClose: 12000 },
        );
        return { elements: [] };
    }

    let data: unknown;
    try {
        data = await response.json();
    } catch (err) {
        await debugOverpassFailure(response);
        toast.error(
            `Overpass returned data that is not valid JSON: ${
                err instanceof Error ? err.message : String(err)
            }. See console for [Overpass debug].`,
            { autoClose: 12000 },
        );
        return { elements: [] };
    }
    const raw = (data ?? {}) as { elements?: any[]; [k: string]: unknown };
    return {
        ...raw,
        elements: Array.isArray(raw.elements) ? raw.elements : [],
    };
};

const OSM_TYPE_LONG: Record<"W" | "R" | "N", string> = {
    W: "way",
    R: "relation",
    N: "node",
};

/**
 * Turn Nominatim `/lookup?polygon_geojson=1&format=json` response into
 * the FeatureCollection shape the rest of the app expects.
 *
 * Exported for unit testing. Returns `null` when the payload contains
 * no usable polygon so callers can fall back to Overpass.
 */
export const parseNominatimBoundaryPayload = (
    raw: unknown,
): { type: "FeatureCollection"; features: any[] } | null => {
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const features = raw
        .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const r = entry as Record<string, unknown>;
            const geom = r.geojson as
                | { type: string; coordinates: unknown }
                | undefined;
            if (!geom || typeof geom !== "object") return null;
            if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") {
                return null;
            }
            return {
                type: "Feature" as const,
                properties: {
                    osm_id: r.osm_id,
                    osm_type: r.osm_type,
                    source: "nominatim",
                },
                geometry: geom,
            };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);

    if (features.length === 0) return null;
    return { type: "FeatureCollection", features };
};

/**
 * Fetch a region boundary polygon from Nominatim's `/lookup` endpoint.
 *
 * Nominatim pre-simplifies boundary polygons: Japan is ~190KB here
 * versus 4-10MB from Overpass `out geom`, and it responds in under a
 * second even when Overpass is hammered (we repeatedly see 504s for
 * country-level relations on cold Railway loads).
 *
 * Returns `null` when Nominatim refuses, responds malformed, or has no
 * polygon for the id; callers should treat `null` as "fall back to
 * Overpass".
 */
const fetchNominatimBoundary = async (
    osmId: string,
    osmTypeLetter: "W" | "R" | "N",
    loadingText?: string,
): Promise<any | null> => {
    // Nominatim expects a prefix-letter-plus-id list: R382313, W123, N456.
    const osmIds = `${osmTypeLetter}${osmId}`;
    const url =
        `${NOMINATIM_API}/lookup` +
        `?osm_ids=${encodeURIComponent(osmIds)}` +
        `&polygon_geojson=1` +
        `&format=json`;

    let response: Response;
    try {
        response = await cacheFetch(
            url,
            loadingText,
            CacheType.PERMANENT_CACHE,
        );
    } catch {
        return null;
    }
    if (!response.ok) return null;

    let raw: unknown;
    try {
        raw = await response.json();
    } catch {
        return null;
    }
    return parseNominatimBoundaryPayload(raw);
};

export interface DetermineGeoJSONOptions {
    /**
     * Skip Nominatim and go straight to Overpass's `out geom` query.
     * Used by the "Load detailed boundary" upgrade flow when the user
     * explicitly wants coastline-precision geometry and is willing to
     * wait for the larger payload.
     */
    forceDetailed?: boolean;
}

const determineGeoJSON = async (
    osmId: string,
    osmTypeLetter: "W" | "R" | "N",
    opts: DetermineGeoJSONOptions = {},
): Promise<any> => {
    // Nominatim first: its pre-simplified polygons are one to two orders
    // of magnitude smaller than Overpass `out geom` and survive periods
    // when Overpass is timing out. We only fall back to Overpass when
    // Nominatim returns nothing usable, or when the caller has
    // explicitly requested detailed geometry.
    if (!opts.forceDetailed) {
        const nominatimResult = await fetchNominatimBoundary(
            osmId,
            osmTypeLetter,
            "Loading map data...",
        );
        if (nominatimResult) {
            return nominatimResult;
        }
    }

    const osmType = OSM_TYPE_LONG[osmTypeLetter];
    const query = `[out:json];${osmType}(${osmId});out geom;`;
    const data = await getOverpassData(
        query,
        opts.forceDetailed
            ? "Loading detailed boundary..."
            : "Loading map data (fallback)...",
        CacheType.PERMANENT_CACHE,
    );
    const geo = osmtogeojson(data);
    return {
        ...geo,
        features: geo.features.filter(
            (feature: any) => feature.geometry.type !== "Point",
        ),
    };
};

export const findTentacleLocations = async (
    question: EncompassingTentacleQuestionSchema,
    text: string = "Determining tentacle locations...",
) => {
    const query = `
[out:json][timeout:25];
nwr["${LOCATION_FIRST_TAG[question.locationType]}"="${question.locationType}"](around:${turf.convertLength(
        question.radius,
        question.unit,
        "meters",
    )}, ${question.lat}, ${question.lng});
out center;
    `;
    const data = await getOverpassData(query, text);
    const elements = data.elements;
    const response = turf.points([]);
    elements.forEach((element: any) => {
        if (!element.tags["name"] && !element.tags["name:en"]) return;
        if (element.lat && element.lon) {
            const name = element.tags["name:en"] ?? element.tags["name"];
            if (
                response.features.find(
                    (feature: any) => feature.properties.name === name,
                )
            )
                return;
            response.features.push(
                turf.point([element.lon, element.lat], { name }),
            );
        }
        if (!element.center || !element.center.lon || !element.center.lat)
            return;
        const name = element.tags["name:en"] ?? element.tags["name"];
        if (
            response.features.find(
                (feature: any) => feature.properties.name === name,
            )
        )
            return;
        response.features.push(
            turf.point([element.center.lon, element.center.lat], { name }),
        );
    });
    return response;
};

export const findAdminBoundary = async (
    latitude: number,
    longitude: number,
    adminLevel: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
    timeoutDuration: number = DEFAULT_ADMIN_BOUNDARY_OVERPASS_TIMEOUT_SEC,
) => {
    const jsonHeader =
        timeoutDuration !== 0
            ? `[out:json][timeout:${timeoutDuration}]`
            : `[out:json]`;
    const query = `
${jsonHeader};
is_in(${latitude}, ${longitude})->.a;
rel(pivot.a)["admin_level"="${adminLevel}"];
out geom;
    `;
    const data = await getOverpassData(query, "Determining matching zone...");
    const geo = osmtogeojson(data);
    return geo.features?.[0];
};

type PolyFeature = Feature<Polygon | MultiPolygon>;
type WaterLineFeature = Feature<LineString | MultiLineString>;
const LANDMASS_WATER_LINE_BUFFER_MILES = 0.06;

function polygonFeaturesOnly(fc: FeatureCollection): PolyFeature[] {
    return fc.features.filter(
        (f): f is PolyFeature =>
            !!f.geometry &&
            (f.geometry.type === "Polygon" ||
                f.geometry.type === "MultiPolygon"),
    );
}

function waterLineFeaturesOnly(fc: FeatureCollection): WaterLineFeature[] {
    return fc.features.filter(
        (f): f is WaterLineFeature =>
            !!f.geometry &&
            (f.geometry.type === "LineString" ||
                f.geometry.type === "MultiLineString"),
    );
}

function chooseContainingOrLargestPolygon(
    features: PolyFeature[],
    latitude: number,
    longitude: number,
): PolyFeature | null {
    if (features.length === 0) return null;
    const pt = turf.point([longitude, latitude]);
    const containing = features.filter((f) =>
        turf.booleanPointInPolygon(pt, f),
    );
    const pool = containing.length > 0 ? containing : features;
    const sorted = [...pool].sort(
        (a, b) => turf.area(b as any) - turf.area(a as any),
    );
    return sorted[0] ?? null;
}

function asPolygonFeature(
    feature: Feature | null | undefined,
): PolyFeature | null {
    if (!feature?.geometry) return null;
    return feature.geometry.type === "Polygon" ||
        feature.geometry.type === "MultiPolygon"
        ? (feature as PolyFeature)
        : null;
}

function explodePolyFeature(feature: PolyFeature): PolyFeature[] {
    if (feature.geometry.type === "Polygon") return [feature];
    const props = feature.properties ?? {};
    return feature.geometry.coordinates.map(
        (coords) => turf.polygon(coords, props) as PolyFeature,
    );
}

export function deriveLandmassComponents(
    territory: PolyFeature,
    waterPolys: PolyFeature[],
    waterLines: WaterLineFeature[] = [],
): PolyFeature[] {
    const bufferedLinePolys = waterLines
        .map((line) =>
            turf.buffer(line as Feature, LANDMASS_WATER_LINE_BUFFER_MILES, {
                units: "miles",
                steps: 32,
            }),
        )
        .filter(
            (f): f is Feature<Polygon | MultiPolygon> =>
                !!f &&
                !!f.geometry &&
                (f.geometry.type === "Polygon" ||
                    f.geometry.type === "MultiPolygon"),
        ) as PolyFeature[];
    const allWaterPolys = [...waterPolys, ...bufferedLinePolys];
    if (allWaterPolys.length === 0) return explodePolyFeature(territory);
    const mergedWater = safeUnion(
        turf.featureCollection(allWaterPolys) as FeatureCollection<
            Polygon | MultiPolygon
        >,
    ) as PolyFeature;
    const split = turf.difference(
        turf.featureCollection([territory, mergedWater]),
    );
    if (
        split &&
        (split.geometry.type === "Polygon" ||
            split.geometry.type === "MultiPolygon")
    ) {
        return explodePolyFeature(split as PolyFeature);
    }
    return explodePolyFeature(territory);
}

export const findZipBoundaryAtPoint = async (
    latitude: number,
    longitude: number,
    timeoutDuration: number = DEFAULT_ADMIN_BOUNDARY_OVERPASS_TIMEOUT_SEC,
): Promise<PolyFeature | null> => {
    const header =
        timeoutDuration !== 0
            ? `[out:json][timeout:${timeoutDuration}]`
            : `[out:json]`;
    const query = `
${header};
is_in(${latitude}, ${longitude})->.a;
(
  rel(pivot.a)["boundary"="postal_code"];
  way(pivot.a)["boundary"="postal_code"];
  rel(pivot.a)["postal_code"];
  way(pivot.a)["postal_code"];
);
out geom tags;
`;
    const data = await getOverpassData(
        query,
        "Finding ZIP/postal boundary...",
        CacheType.ZONE_CACHE,
    );
    const geo = osmtogeojson(data) as FeatureCollection;
    return chooseContainingOrLargestPolygon(
        polygonFeaturesOnly(geo),
        latitude,
        longitude,
    );
};

export const findPoliticalDistrictBoundaryAtPoint = async (
    latitude: number,
    longitude: number,
    timeoutDuration: number = DEFAULT_ADMIN_BOUNDARY_OVERPASS_TIMEOUT_SEC,
): Promise<PolyFeature | null> => {
    const header =
        timeoutDuration !== 0
            ? `[out:json][timeout:${timeoutDuration}]`
            : `[out:json]`;
    const nycCouncilQuery = `
${header};
is_in(${latitude}, ${longitude})->.a;
(
  rel(pivot.a)["boundary"="political"]["name"~"New York City Council District",i];
  way(pivot.a)["boundary"="political"]["name"~"New York City Council District",i];
);
out geom tags;
`;
    const nycData = await getOverpassData(
        nycCouncilQuery,
        "Finding NYC council district...",
        CacheType.ZONE_CACHE,
    );
    const nycGeo = osmtogeojson(nycData) as FeatureCollection;
    const nycDistrict = chooseContainingOrLargestPolygon(
        polygonFeaturesOnly(nycGeo),
        latitude,
        longitude,
    );
    if (nycDistrict) return nycDistrict;

    const query = `
${header};
is_in(${latitude}, ${longitude})->.a;
(
  rel(pivot.a)["boundary"="political"];
  way(pivot.a)["boundary"="political"];
);
out geom tags;
`;
    const data = await getOverpassData(
        query,
        "Finding political district...",
        CacheType.ZONE_CACHE,
    );
    const geo = osmtogeojson(data) as FeatureCollection;
    const polys = polygonFeaturesOnly(geo);
    if (polys.length > 0) {
        const districtish = polys.filter((f) => {
            const props = (f.properties ?? {}) as Record<string, unknown>;
            const name = String(props.name ?? "");
            const shortName = String(props.short_name ?? "");
            const boundary = String(props.boundary ?? "");
            const descriptor = `${name} ${shortName} ${boundary}`.toLowerCase();
            return (
                descriptor.includes("district") ||
                descriptor.includes("council") ||
                descriptor.includes("assembly") ||
                descriptor.includes("senate") ||
                descriptor.includes("legislative")
            );
        });
        const picked = chooseContainingOrLargestPolygon(
            districtish.length > 0 ? districtish : polys,
            latitude,
            longitude,
        );
        if (picked) return picked;
    }

    // Fallback when political districts are absent/poorly tagged.
    return (
        asPolygonFeature(
            await findAdminBoundary(latitude, longitude, 6, timeoutDuration),
        ) ??
        asPolygonFeature(
            await findAdminBoundary(latitude, longitude, 5, timeoutDuration),
        ) ??
        asPolygonFeature(
            await findAdminBoundary(latitude, longitude, 4, timeoutDuration),
        ) ??
        null
    );
};

export const findLandmassBoundaryAtPoint = async (
    latitude: number,
    longitude: number,
    timeoutDuration: number = DEFAULT_ADMIN_BOUNDARY_OVERPASS_TIMEOUT_SEC,
): Promise<PolyFeature | null> => {
    // First pass: split the current territory by OSM water polygons/rivers.
    // This better separates nearby islands/mainland than coarse admin fallbacks.
    const territory = asPolygonFeature(
        (playableTerritoryUnion.get() as Feature | null | undefined) ??
            (mapGeoJSON.get()
                ? (safeUnion(mapGeoJSON.get() as any) as Feature | null)
                : null),
    );
    if (territory) {
        try {
            const [west, south, east, north] = turf.bbox(territory);
            const header =
                timeoutDuration !== 0
                    ? `[out:json][timeout:${timeoutDuration}]`
                    : `[out:json]`;
            const waterQuery = `
${header};
(
  way["natural"="water"](${south},${west},${north},${east});
  relation["natural"="water"](${south},${west},${north},${east});
  way["waterway"="riverbank"](${south},${west},${north},${east});
  relation["waterway"="riverbank"](${south},${west},${north},${east});
  way["waterway"~"^(river|canal|tidal_channel|stream)$"](${south},${west},${north},${east});
  relation["waterway"~"^(river|canal|tidal_channel|stream)$"](${south},${west},${north},${east});
);
out geom;
`;
            const waterData = await getOverpassData(
                waterQuery,
                "Finding separating waterways...",
                CacheType.ZONE_CACHE,
            );
            const waterGeo = osmtogeojson(waterData) as FeatureCollection;
            const waterPolys = polygonFeaturesOnly(waterGeo);
            const waterLines = waterLineFeaturesOnly(waterGeo);
            if (waterPolys.length > 0 || waterLines.length > 0) {
                const landParts = deriveLandmassComponents(
                    territory,
                    waterPolys,
                    waterLines,
                );
                const picked = chooseContainingOrLargestPolygon(
                    landParts,
                    latitude,
                    longitude,
                );
                if (picked) return picked;
            }
        } catch {
            // Fall back to island/admin approaches below.
        }
    }

    const header =
        timeoutDuration !== 0
            ? `[out:json][timeout:${timeoutDuration}]`
            : `[out:json]`;
    const query = `
${header};
is_in(${latitude}, ${longitude})->.a;
(
  rel(pivot.a)["place"="island"];
  way(pivot.a)["place"="island"];
  rel(pivot.a)["natural"="island"];
  way(pivot.a)["natural"="island"];
  rel(pivot.a)["natural"="islet"];
  way(pivot.a)["natural"="islet"];
);
out geom tags;
`;
    const data = await getOverpassData(
        query,
        "Finding landmass boundary...",
        CacheType.ZONE_CACHE,
    );
    const geo = osmtogeojson(data) as FeatureCollection;
    const island = chooseContainingOrLargestPolygon(
        polygonFeaturesOnly(geo),
        latitude,
        longitude,
    );
    if (island) return island;

    // Non-island fallback: county-ish boundary approximates mainland buckets.
    return (
        asPolygonFeature(
            await findAdminBoundary(latitude, longitude, 6, timeoutDuration),
        ) ??
        asPolygonFeature(
            await findAdminBoundary(latitude, longitude, 5, timeoutDuration),
        ) ??
        null
    );
};

/** Pinned Natural Earth 50m coast (public domain) when OSM bbox returns nothing. */
const NATURAL_EARTH_50M_COAST =
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_coastline.geojson";

const COASTLINE_BBOX_PAD_DEG = 0.08;

function lineStringCoastFeatures(
    fc: FeatureCollection,
): Feature<LineString | MultiLineString>[] {
    const out: Feature<LineString | MultiLineString>[] = [];
    for (const f of fc.features) {
        const t = f.geometry?.type;
        if (t === "LineString" || t === "MultiLineString") {
            out.push(f as Feature<LineString | MultiLineString>);
        }
    }
    return out;
}

/**
 * OSM shorelines in the game bbox: sea/land {@code natural=coastline} plus
 * {@code waterway=riverbank} (tidal river banks, e.g. Hudson / East River).
 * Does **not** fetch {@code natural=water} polygons, so inland lakes (Central
 * Park, etc.) are not coastline for measuring.
 */
async function fetchCoastlineLinesOsmInBbox(
    bbox: BBox,
): Promise<FeatureCollection<LineString | MultiLineString>> {
    const [west, south, east, north] = bbox;
    const w = west - COASTLINE_BBOX_PAD_DEG;
    const s = south - COASTLINE_BBOX_PAD_DEG;
    const e = east + COASTLINE_BBOX_PAD_DEG;
    const n = north + COASTLINE_BBOX_PAD_DEG;
    const query = `
[out:json][timeout:90];
(
  way["natural"="coastline"](${s},${w},${n},${e});
  relation["natural"="coastline"](${s},${w},${n},${e});
  way["waterway"="riverbank"](${s},${w},${n},${e});
);
out geom;
`;
    const data = await getOverpassData(
        query,
        "Fetching shoreline (OSM) for measuring…",
        CacheType.ZONE_CACHE,
    );
    const geo = osmtogeojson(data) as FeatureCollection;
    const features = lineStringCoastFeatures(geo);
    return { type: "FeatureCollection", features };
}

async function fetchCoastlineNaturalEarthLines(): Promise<
    FeatureCollection<LineString | MultiLineString>
> {
    const base = import.meta.env.BASE_URL.replace(/\/?$/, "");
    const localPath = `${base}/coastline50.geojson`;
    let response = await cacheFetch(
        localPath,
        undefined,
        CacheType.PERMANENT_CACHE,
    );
    if (!response.ok) {
        response = await cacheFetch(
            NATURAL_EARTH_50M_COAST,
            "Fetching coastline data (fallback)…",
            CacheType.PERMANENT_CACHE,
        );
    }
    if (!response.ok) {
        return { type: "FeatureCollection", features: [] };
    }
    let data: unknown;
    try {
        data = await response.json();
    } catch {
        return { type: "FeatureCollection", features: [] };
    }
    const raw = data as FeatureCollection | Feature;
    const fc: FeatureCollection =
        raw.type === "FeatureCollection"
            ? raw
            : raw.type === "Feature"
              ? { type: "FeatureCollection", features: [raw] }
              : { type: "FeatureCollection", features: [] };
    return {
        type: "FeatureCollection",
        features: lineStringCoastFeatures(fc),
    };
}

/**
 * Line geometry for “distance to coastline” measuring: prefer OSM shoreline +
 * river banks in the current map extent; fall back to Natural Earth ocean coast
 * (or optional {@code public/coastline50.geojson}).
 */
export async function fetchCoastlinesForMeasuring(
    bbox: BBox,
): Promise<FeatureCollection<LineString | MultiLineString>> {
    const osm = await fetchCoastlineLinesOsmInBbox(bbox);
    if (osm.features.length > 0) {
        return osm;
    }
    return fetchCoastlineNaturalEarthLines();
}

const escapeOverpassRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLineRef = (value: string) =>
    value
        .trim()
        // Some feeds expose refs like "<7>" or wrap alphanumerics in
        // punctuation. Matching should use the semantic token.
        .replace(/^<+/, "")
        .replace(/>+$/, "");

const overpassLineRefClause = (lineRef: string) => {
    const escaped = escapeOverpassRegex(normalizeLineRef(lineRef));
    if (!escaped) return "";
    // Avoid broad character classes here: some public Overpass backends are
    // picky and can reject otherwise-valid regexes with 400 parser errors.
    // Match exact token or semicolon-separated token list.
    const tokenPattern = `(^${escaped}$|^${escaped};|;${escaped};|;${escaped}$)`;
    return `["ref"~"${tokenPattern}"]`;
};

const parseOsmRef = (
    osmRef: string,
): { type: "node" | "way" | "relation"; id: number } | null => {
    const [rawType, rawId] = String(osmRef ?? "").split("/");
    if (rawType !== "node" && rawType !== "way" && rawType !== "relation") {
        return null;
    }
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { type: rawType, id };
};

const lineOriginSetsQuery = (
    osmRef: string,
): { query: string; hasOriginWays: boolean } | null => {
    const parsed = parseOsmRef(osmRef);
    if (!parsed) return null;

    if (parsed.type === "node") {
        return {
            query: `
node(${parsed.id})->.origin_nodes;
`,
            hasOriginWays: false,
        };
    }
    if (parsed.type === "way") {
        return {
            query: `
way(${parsed.id})->.origin_ways;
node(w.origin_ways)->.origin_nodes;
`,
            hasOriginWays: true,
        };
    }
    return {
        query: `
relation(${parsed.id})->.origin_rel;
way(r.origin_rel)->.origin_ways;
node(r.origin_rel)->.origin_nodes;
`,
        hasOriginWays: true,
    };
};

/** Train-line queries are small; omit maxsize — public instances often 400 when maxsize exceeds their cap. */
const LINE_ROUTE_QUERY_SETTINGS = "[out:json][timeout:120]";

/** Station markers are often street-side; subway ways can sit farther away than 400 m. */
const TRAIN_LINE_NEAR_METERS = 1000;

const lineRoutesQuery = (
    originSets: string,
    hasOriginWays: boolean,
    routeTypeFilter: string,
    lineRefClause = "",
) => `
${LINE_ROUTE_QUERY_SETTINGS};
${originSets}
way(bn.origin_nodes)->.node_ways;
(
  rel(bn.origin_nodes)["type"="route"]["route"~"^(${routeTypeFilter})$"]${lineRefClause};
  ${hasOriginWays ? `rel(bw.origin_ways)["type"="route"]["route"~"^(${routeTypeFilter})$"]${lineRefClause};` : ""}
  rel(bw.node_ways)["type"="route"]["route"~"^(${routeTypeFilter})$"]${lineRefClause};
)->.line_route_rels;
(.line_route_rels;>;);
`;

const lineRoutesQueryByCoord = (
    latitude: number,
    longitude: number,
    routeTypeFilter: string,
    lineRefClause = "",
) => `
${LINE_ROUTE_QUERY_SETTINGS};
way(around:${TRAIN_LINE_NEAR_METERS},${latitude},${longitude})["railway"~"^(rail|subway|light_rail|tram|monorail|funicular)$"]->.near_ways;
(
  rel(bw.near_ways)["type"="route"]["route"~"^(${routeTypeFilter})$"]${lineRefClause};
)->.line_route_rels;
(.line_route_rels;>;);
`;

/**
 * OSM route relations expand to thousands of untagged track vertices. Hiding
 * zones use railway=station (and similar) nodes; intersecting with track
 * vertices almost always misses real stations for subway mapping.
 */
function isStopLikeStationNode(element: {
    type?: string;
    tags?: Record<string, string | undefined>;
}): boolean {
    if (element?.type !== "node") return false;
    const t = element.tags ?? {};
    const rw = t.railway;
    if (
        rw === "station" ||
        rw === "halt" ||
        rw === "tram_stop" ||
        rw === "stop"
    ) {
        return true;
    }
    if (t.subway === "yes" || t.light_rail === "yes" || t.tram === "yes") {
        return true;
    }
    const pt = t.public_transport;
    if (pt === "station" || pt === "stop_position" || pt === "stop") {
        return true;
    }
    if (t.train === "yes") return true;
    return false;
}

/**
 * Result of resolving stations on the same train line.
 *
 *  - `nodeIds`: OSM node ids of stop-like stations on this route. Used when
 *    the zone circle's `properties.id` is itself a `node/<id>` (the common
 *    case for `railway=station` zones).
 *  - `stops`: lat/lon + normalized name key for every stop-like node on the
 *    route. Used to match zone circles by spatial proximity (homonym-safe:
 *    "111 St" on the J in Richmond Hill is ~8 km from "111 St" on the 7 in
 *    Corona, so a small radius cleanly disambiguates) — and the name key is
 *    kept around for the GTFS-style fallback Set when the geometry is
 *    unavailable.
 */
export interface TrainLineRouteStop {
    lat: number;
    lon: number;
    nameKey: string;
}
export interface TrainLineStationMatchers {
    nodeIds: number[];
    stops: TrainLineRouteStop[];
}

export const trainLineNodeFinder = async (
    node: string,
    lineRef?: string,
    aroundLatLng?: { latitude: number; longitude: number },
): Promise<TrainLineStationMatchers> => {
    const empty: TrainLineStationMatchers = {
        nodeIds: [],
        stops: [],
    };
    const origin = lineOriginSetsQuery(node);
    if (!origin) return empty;
    // Build the line set from route relations directly connected to this
    // station node. Fallback to route relations on nearby rail ways because
    // some station points are mapped adjacent to (not on) track members.
    const routeTypeFilter = "subway|light_rail|train|tram|monorail|funicular";
    const lineRefClause = overpassLineRefClause(lineRef ?? "");

    const query = `${lineRoutesQuery(
        origin.query,
        origin.hasOriginWays,
        routeTypeFilter,
        lineRefClause,
    )}
out body;
`;
    const primaryPromise = getOverpassData(query, "Finding train lines...");
    const fallbackPromise =
        aroundLatLng == null
            ? null
            : getOverpassData(
                  `${lineRoutesQueryByCoord(
                      aroundLatLng.latitude,
                      aroundLatLng.longitude,
                      routeTypeFilter,
                      lineRefClause,
                  )}
out body;
`,
                  "Finding nearby train lines...",
              );

    const [primaryData, fallbackData] = await Promise.all([
        primaryPromise,
        fallbackPromise ?? Promise.resolve({ elements: [] as any[] }),
    ]);

    const nodeIds: number[] = [];
    const stops: TrainLineRouteStop[] = [];
    const seenNodeIds = new Set<number>();
    const collect = (elements: any[] | undefined) => {
        for (const element of elements ?? []) {
            if (!isStopLikeStationNode(element)) continue;
            if (
                typeof element.id === "number" &&
                !seenNodeIds.has(element.id)
            ) {
                seenNodeIds.add(element.id);
                nodeIds.push(element.id);
            }
            const lat =
                typeof element.lat === "number" ? element.lat : undefined;
            const lon =
                typeof element.lon === "number" ? element.lon : undefined;
            if (lat == null || lon == null) continue;
            const tags = element.tags ?? {};
            const rawName = tags["name:en"] || tags.name || "";
            const nameKey = rawName ? stationNameMatchKey(String(rawName)) : "";
            stops.push({ lat, lon, nameKey });
        }
    };

    // Union graph- and geography-based hits. The nearest railway=station OSM
    // node is often tied to one mode (e.g. LIRR); subway routes may only appear
    // via nearby railway=subway ways unless we always merge the around: query.
    collect(primaryData.elements);
    collect(fallbackData.elements);

    return { nodeIds, stops };
};

export const trainLineRefsForStation = async (
    node: string,
    aroundLatLng?: { latitude: number; longitude: number },
): Promise<string[]> => {
    const origin = lineOriginSetsQuery(node);
    if (!origin) return [];
    const routeTypeFilter = "subway|light_rail|train|tram|monorail|funicular";
    const query = `${lineRoutesQuery(
        origin.query,
        origin.hasOriginWays,
        routeTypeFilter,
    )}
out tags;
`;

    const primaryPromise = getOverpassData(
        query,
        "Finding train line options...",
    );
    const fallbackPromise =
        aroundLatLng == null
            ? null
            : getOverpassData(
                  `${lineRoutesQueryByCoord(
                      aroundLatLng.latitude,
                      aroundLatLng.longitude,
                      routeTypeFilter,
                  )}
out tags;
`,
                  "Finding nearby train line options...",
              );

    const [primaryData, fallbackData] = await Promise.all([
        primaryPromise,
        fallbackPromise ?? Promise.resolve({ elements: [] as any[] }),
    ]);

    const refs = new Set<string>();
    const ROUTE_REF_TAG_KEYS = [
        "ref",
        "ref:MTA",
        "ref:US:NYCT",
        "nyc_subway:route",
    ] as const;
    const collectRefs = (elements: any[] = []) => {
        for (const element of elements) {
            if (element?.type !== "relation") continue;
            const tags = element.tags ?? {};
            for (const key of ROUTE_REF_TAG_KEYS) {
                const rawRef = String(tags[key] ?? "").trim();
                if (!rawRef) continue;
                const pieces = rawRef
                    .split(/[;,/]/)
                    .map((part) => normalizeLineRef(part))
                    .filter(Boolean);
                for (const ref of pieces) refs.add(ref);
            }
        }
    };

    collectRefs(primaryData.elements ?? []);
    collectRefs(fallbackData.elements ?? []);

    return [...refs].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
    );
};

export const findPlacesInZone = async (
    filter: string,
    loadingText?: string,
    searchType:
        | "node"
        | "way"
        | "relation"
        | "nwr"
        | "nw"
        | "wr"
        | "nr"
        | "area" = "nwr",
    outType: "center" | "geom" = "center",
    alternatives: string[] = [],
    timeoutDuration: number = 0,
    /**
     * When false (default), drop elements whose center lies outside
     * {@link playableTerritoryUnion}. Airport Voronoi / nearest-airport
     * matching needs all metro IATA aerodromes in the query polygon; a hub
     * can sit just outside the holed playable mask while still defining the
     * correct catchment split for stations inside the mask.
     */
    skipPlayableTerritoryFilter = false,
) => {
    const $polyGeoJSON = polyGeoJSON.get();
    const jsonHeader =
        timeoutDuration !== 0
            ? `[out:json][timeout:${timeoutDuration}][maxsize:536870912]`
            : `[out:json]`;

    let data: { elements?: any[] };

    if ($polyGeoJSON) {
        const polyStr = polyClauseStringForOverpass($polyGeoJSON);
        const query = `
${jsonHeader};
(
${searchType}${filter}(poly:"${polyStr}");
${
    alternatives.length > 0
        ? alternatives
              .map(
                  (alternative) =>
                      `${searchType}${alternative}(poly:"${polyStr}");`,
              )
              .join("\n")
        : ""
}
);
out ${outType};
`;
        data = await getOverpassData(query, loadingText, CacheType.ZONE_CACHE);
    } else {
        const primaryLocation = mapGeoLocation.get();
        const additionalLocations = additionalMapGeoLocations
            .get()
            .filter((entry) => entry.added)
            .map((entry) => entry.location);
        const allLocations = [primaryLocation, ...additionalLocations];

        if (allLocations.length >= MULTI_AREA_SPLIT_THRESHOLD) {
            const header =
                timeoutDuration !== 0
                    ? `[out:json][timeout:${timeoutDuration}][maxsize:536870912];`
                    : `[out:json][maxsize:536870912];`;

            const runSplit = async () => {
                const queries = allLocations.map((loc) => {
                    const relationToAreaBlocks = `relation(${loc.properties.osm_id});map_to_area->.region0;`;
                    const regionVar = `area.region0`;
                    const altQueries =
                        alternatives.length > 0
                            ? alternatives
                                  .map(
                                      (alt) =>
                                          `${searchType}${alt}(${regionVar});`,
                                  )
                                  .join("\n")
                            : "";
                    return `
${header}
${relationToAreaBlocks}
(
            ${searchType}${filter}(${regionVar});
            ${altQueries}
);
out ${outType};
`;
                });

                const merged: any[] = [];
                for (
                    let i = 0;
                    i < queries.length;
                    i += MULTI_AREA_PARALLEL_CHUNK
                ) {
                    if (i > 0) {
                        await new Promise((r) =>
                            setTimeout(r, MULTI_AREA_CHUNK_GAP_MS),
                        );
                    }
                    const chunk = queries.slice(
                        i,
                        i + MULTI_AREA_PARALLEL_CHUNK,
                    );
                    const parts = await Promise.all(
                        chunk.map((q) =>
                            getOverpassData(q, undefined, CacheType.ZONE_CACHE),
                        ),
                    );
                    for (const p of parts) {
                        merged.push(...(p.elements ?? []));
                    }
                }
                return { elements: dedupeOsmElements(merged) };
            };

            data = loadingText
                ? await toast.promise(runSplit(), { pending: loadingText })
                : await runSplit();
        } else {
            const relationToAreaBlocks = allLocations
                .map((loc, idx) => {
                    const regionVar = `.region${idx}`;
                    return `relation(${loc.properties.osm_id});map_to_area->${regionVar};`;
                })
                .join("\n");
            const searchBlocks = allLocations
                .map((_, idx) => {
                    const regionVar = `area.region${idx}`;
                    const altQueries =
                        alternatives.length > 0
                            ? alternatives
                                  .map(
                                      (alt) =>
                                          `${searchType}${alt}(${regionVar});`,
                                  )
                                  .join("\n")
                            : "";
                    return `
            ${searchType}${filter}(${regionVar});
            ${altQueries}
          `;
                })
                .join("\n");
            const query = `
        ${jsonHeader};
        ${relationToAreaBlocks}
        (
        ${searchBlocks}
        );
        out ${outType};
        `;
            data = await getOverpassData(
                query,
                loadingText,
                CacheType.ZONE_CACHE,
            );
        }
    }
    if (!data.elements) {
        data.elements = [];
    }

    const subtractedEntries = additionalMapGeoLocations
        .get()
        .filter((e) => !e.added);
    const subtractedPolygons = subtractedEntries.map((entry) => entry.location);
    if (subtractedPolygons.length > 0 && data.elements.length > 0) {
        const turfPolys = await Promise.all(
            subtractedPolygons.map(
                async (location) =>
                    turf.combine(
                        await determineGeoJSON(
                            location.properties.osm_id.toString(),
                            location.properties.osm_type,
                        ),
                    ).features[0],
            ),
        );
        data.elements = data.elements.filter((el: any) => {
            const lon = el.center ? el.center.lon : el.lon;
            const lat = el.center ? el.center.lat : el.lat;
            if (typeof lon !== "number" || typeof lat !== "number")
                return false;
            const pt = turf.point([lon, lat]);
            return !turfPolys.some((poly) =>
                turf.booleanPointInPolygon(pt, poly as any),
            );
        });
    }
    if (!skipPlayableTerritoryFilter) {
        data.elements = filterOsmElementsToPlayableTerritory(
            data.elements,
            playableTerritoryUnion.get(),
        );
    }
    return data as { elements: any[]; remark?: string };
};

/**
 * Return the set of OSM node IDs that are members of heritage /
 * tourist / preserved / abandoned railway ways within the current
 * scope.
 *
 * We use this to post-filter station lists when the user opts to
 * exclude heritage railways — stations themselves almost never carry
 * the relevant tags (they usually look like a normal
 * `railway=station`), but the way they sit on does. Node-level
 * filtering in the Overpass query isn't sufficient for this.
 *
 * Cached under ZONE_CACHE so toggling the option (or editing questions)
 * doesn't re-hit the network.
 */
function heritageNodeIdsFromElements(elements: any[] | undefined): Set<number> {
    const ids = new Set<number>();
    for (const el of elements ?? []) {
        if (el.type === "node" && typeof el.id === "number") {
            ids.add(el.id);
        }
    }
    return ids;
}

export const findHeritageRailwayMemberNodeIds = async (): Promise<
    Set<number>
> => {
    const $polyGeoJSON = polyGeoJSON.get();

    // The candidate "non-active heritage" railway way tags. We pick up
    // member nodes of any way matching one of these; those nodes are
    // then dropped from the station list.
    const wayFilters = [
        '["railway:preserved"="yes"]',
        '["railway"]["usage"="tourism"]',
        '["railway"="abandoned"]',
        '["railway"="disused"]',
        '["railway"="heritage"]',
    ];

    const heritageQuery = (scopeBlock: string) => `
[out:json][timeout:120][maxsize:536870912];
(
${scopeBlock}
)->.heritage_ways;
node(w.heritage_ways);
out ids;
`;

    if ($polyGeoJSON) {
        const poly = polyClauseStringForOverpass($polyGeoJSON);
        const scopeBlock = wayFilters
            .map((f) => `way${f}(poly:"${poly}");`)
            .join("\n");
        const data = await getOverpassData(
            heritageQuery(scopeBlock),
            "Finding heritage railway lines...",
            CacheType.ZONE_CACHE,
        );
        return heritageNodeIdsFromElements(data.elements);
    }

    const primaryLocation = mapGeoLocation.get();
    const additionalLocations = additionalMapGeoLocations
        .get()
        .filter((entry) => entry.added)
        .map((entry) => entry.location);
    const allLocations = [primaryLocation, ...additionalLocations];

    if (allLocations.length >= MULTI_AREA_SPLIT_THRESHOLD) {
        const runSplit = async () => {
            const ids = new Set<number>();
            const queries = allLocations.map((loc) => {
                const scope = wayFilters
                    .map((f) => `way${f}(area.r0);`)
                    .join("\n");
                return `
[out:json][timeout:120][maxsize:536870912];
relation(${loc.properties.osm_id});map_to_area->.r0;
(
${scope}
)->.heritage_ways;
node(w.heritage_ways);
out ids;
`;
            });

            for (
                let i = 0;
                i < queries.length;
                i += MULTI_AREA_PARALLEL_CHUNK
            ) {
                if (i > 0) {
                    await new Promise((r) =>
                        setTimeout(r, MULTI_AREA_CHUNK_GAP_MS),
                    );
                }
                const chunk = queries.slice(i, i + MULTI_AREA_PARALLEL_CHUNK);
                const parts = await Promise.all(
                    chunk.map((q) =>
                        getOverpassData(q, undefined, CacheType.ZONE_CACHE),
                    ),
                );
                for (const p of parts) {
                    for (const id of heritageNodeIdsFromElements(p.elements)) {
                        ids.add(id);
                    }
                }
            }
            return ids;
        };

        return toast.promise(runSplit(), {
            pending: "Finding heritage railway lines...",
        });
    }

    const areaBlocks = allLocations
        .map(
            (loc, idx) =>
                `relation(${loc.properties.osm_id});map_to_area->.region${idx};`,
        )
        .join("\n");
    const searchBlocks = allLocations
        .flatMap((_loc, idx) =>
            wayFilters.map((f) => `way${f}(area.region${idx});`),
        )
        .join("\n");
    const scopeBlock = `${areaBlocks}\n${searchBlocks}`;

    const data = await getOverpassData(
        heritageQuery(scopeBlock),
        "Finding heritage railway lines...",
        CacheType.ZONE_CACHE,
    );

    return heritageNodeIdsFromElements(data.elements);
};

export const findPlacesSpecificInZone = async (
    location: `${QuestionSpecificLocation}`,
) => {
    const locations = (
        await findPlacesInZone(
            location,
            `Finding ${
                location === '["brand:wikidata"="Q38076"]'
                    ? "McDonald's"
                    : "7-Elevens"
            }...`,
        )
    ).elements;
    return turf.featureCollection(
        locations.map((x: any) =>
            turf.point([
                x.center ? x.center.lon : x.lon,
                x.center ? x.center.lat : x.lat,
            ]),
        ),
    );
};

export const nearestToQuestion = async (
    question: HomeGameMatchingQuestions | HomeGameMeasuringQuestions,
) => {
    let radius = 30;
    let instances: any = { features: [] };
    while (instances.features.length === 0) {
        instances = await findTentacleLocations(
            {
                lat: question.lat,
                lng: question.lng,
                radius: radius,
                unit: "miles",
                location: false,
                locationType: question.type,
                drag: false,
                color: "black",
                collapsed: false,
            },
            "Finding matching locations...",
        );
        radius += 30;
    }
    const questionPoint = turf.point([question.lng, question.lat]);
    return turf.nearestPoint(questionPoint, instances as any);
};

export const determineMapBoundaries = async (
    opts: DetermineGeoJSONOptions = {},
) => {
    const mapGeoDatum = await Promise.all(
        [
            {
                location: mapGeoLocation.get(),
                added: true,
                base: true,
            },
            ...additionalMapGeoLocations.get(),
        ].map(async (location) => ({
            added: location.added,
            data: await determineGeoJSON(
                location.location.properties.osm_id.toString(),
                location.location.properties.osm_type,
                opts,
            ),
        })),
    );

    let mapGeoData = turf.featureCollection([
        safeUnion(
            turf.featureCollection(
                mapGeoDatum
                    .filter((x) => x.added)
                    .flatMap((x) => x.data.features),
            ) as any,
        ),
    ]);

    const differences = mapGeoDatum.filter((x) => !x.added).map((x) => x.data);

    if (differences.length > 0) {
        mapGeoData = turf.featureCollection([
            turf.difference(
                turf.featureCollection([
                    mapGeoData.features[0],
                    ...differences.flatMap((x) => x.features),
                ]),
            )!,
        ]);
    }

    if (turf.coordAll(mapGeoData).length > 10000) {
        turf.simplify(mapGeoData, {
            tolerance: 0.0005,
            highQuality: true,
            mutate: true,
        });
    }

    return turf.combine(mapGeoData) as FeatureCollection<MultiPolygon>;
};
