/**
 * Bundled station source for hiding zones.
 *
 * Turns the static NYC subway + metro-area rail datasets into StationPlace
 * features, filtered to the current playable territory. This lets the hiding-
 * zone "stations" flow skip Overpass entirely for the NY/NJ/CT/PA region —
 * Overpass `nwr[railway=station]` queries over a whole county/state routinely
 * take 30-70s and 504, while this is instant, can't time out, and works
 * offline. The data is the same curated set the station-count indicator uses.
 *
 * Coverage: NYC Subway, LIRR, Metro-North, NJ Transit (rail + light rail),
 * SEPTA, Amtrak (NEC + Shore Line East), Hartford Line. Outside that region,
 * the caller should fall back to Overpass.
 */
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";

import { METRO_AREA_RAIL_STATIONS } from "@/data/metro-area-rail-stations";
import { NYC_MAJOR_SUBWAY_STATIONS } from "@/data/nyc-subway-major-stations";
import type { StationPlace } from "@/maps/api";

interface BundledStation {
    name: string;
    lat: number;
    lng: number;
    /** Synthetic, OSM-id-shaped (`source/id`) so downstream dedup keys on it. */
    id: string;
}

/** Normalize a station name into a stable id slug. */
const slugifyStationName = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

// Ids are content-based (namespace + name slug + exact coords), NOT array
// index: `disabledStations` persists these, so an index-derived id would
// silently re-point a user's exclusions to different stations after any
// reorder/insertion in the source datasets. Coords are the unique stable key
// (no two stations share exact coords; names like "86 St" repeat).
const BUNDLED_STATIONS: BundledStation[] = [
    ...NYC_MAJOR_SUBWAY_STATIONS.map(
        (s): BundledStation => ({
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            id: `bundled/subway-${slugifyStationName(s.name)}-${s.lat}-${s.lng}`,
        }),
    ),
    ...METRO_AREA_RAIL_STATIONS.map(
        (s): BundledStation => ({
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            // `rail-` namespace + system keeps metro ids from ever colliding
            // with the subway ids above, even if a future system lowercased
            // to "subway".
            id: `bundled/rail-${s.system.toLowerCase()}-${slugifyStationName(s.name)}-${s.lat}-${s.lng}`,
        }),
    ),
];

/** Total bundled stations (subway + metro rail), unfiltered. */
export const BUNDLED_STATION_COUNT = BUNDLED_STATIONS.length;

type AnyGeo =
    | Feature<Polygon | MultiPolygon>
    | GeoJSON.FeatureCollection
    | null
    | undefined;

function pointInScope(lng: number, lat: number, scope: AnyGeo): boolean {
    if (!scope) return true; // no scope → no filtering
    const pt = turf.point([lng, lat]);
    const features =
        scope.type === "FeatureCollection" ? scope.features : [scope];
    for (const f of features) {
        const geom = (f as Feature).geometry ?? (f as any);
        if (geom?.type === "Polygon" || geom?.type === "MultiPolygon") {
            try {
                if (turf.booleanPointInPolygon(pt, f as any)) return true;
            } catch {
                /* skip malformed polygon */
            }
        }
    }
    return false;
}

/**
 * Bundled stations as StationPlace features, filtered to `scope` (the playable
 * territory union, or any polygon / feature collection). Pass null for the full
 * set.
 */
export function getBundledStationPlaces(scope: AnyGeo): StationPlace[] {
    const out: StationPlace[] = [];
    for (const s of BUNDLED_STATIONS) {
        if (!pointInScope(s.lng, s.lat, scope)) continue;
        out.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [s.lng, s.lat] },
            properties: { id: s.id, name: s.name },
        });
    }
    return out;
}
