import type { Position } from "@/features/map/geojsonTypes";
import type { MatchingCategory, OsmFeature } from "./matchingTypes";
import { getCategoryConfig } from "./matchingCategories";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const DEFAULT_SEARCH_RADIUS_METERS = 50_000;
const EARTH_RADIUS_METERS = 6_371_008.8;

type OverpassElement = {
    center?: { lat: number; lon: number };
    id?: number;
    lat?: number;
    lon?: number;
    tags?: Record<string, string>;
    type?: string;
};

type OverpassResponse = {
    elements?: OverpassElement[];
};

export type OsmFeatureWithDistance = OsmFeature & {
    distanceMeters: number;
};

export async function findMatchingFeatures(
    category: MatchingCategory,
    center: Position,
    options?: { maxCandidates?: number; searchRadiusMeters?: number },
): Promise<OsmFeatureWithDistance[]> {
    const config = getCategoryConfig(category);
    if (!config || !config.osmQueryTags) {
        return [];
    }

    const searchRadiusMeters =
        options?.searchRadiusMeters ?? DEFAULT_SEARCH_RADIUS_METERS;
    const maxCandidates = options?.maxCandidates ?? 10;
    const [lon, lat] = center;
    const query = buildOverpassQuery(
        config.osmQueryTags,
        lat,
        lon,
        searchRadiusMeters,
    );

    const response = await fetch(
        `${OVERPASS_API}?data=${encodeURIComponent(query)}`,
    );

    if (!response.ok) {
        throw new Error(`Overpass API error ${response.status}`);
    }

    const data = (await response.json()) as OverpassResponse;
    const features = parseOverpassElements(data.elements ?? []);

    const withDistance = features.map((feature) => ({
        ...feature,
        distanceMeters: haversineDistanceMeters(
            lat,
            lon,
            feature.lat,
            feature.lon,
        ),
    }));

    withDistance.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return withDistance.slice(0, maxCandidates);
}

export async function findNearestMatchingFeature(
    category: MatchingCategory,
    center: Position,
    searchRadiusMeters = DEFAULT_SEARCH_RADIUS_METERS,
): Promise<OsmFeature | null> {
    const results = await findMatchingFeatures(category, center, {
        maxCandidates: 1,
        searchRadiusMeters,
    });
    return results[0] ?? null;
}

export function buildOverpassQuery(
    tags: string,
    lat: number,
    lon: number,
    radiusMeters: number,
): string {
    return `[out:json][timeout:30];
(
  node${tags}(around:${radiusMeters},${lat},${lon});
  way${tags}(around:${radiusMeters},${lat},${lon});
  relation${tags}(around:${radiusMeters},${lat},${lon});
);
out center tags qt;`;
}

export function parseOverpassElements(
    elements: OverpassElement[],
): OsmFeature[] {
    const features: OsmFeature[] = [];

    for (const element of elements) {
        if (!isValidOverpassElement(element)) {
            continue;
        }

        const lat = element.type === "node" ? element.lat : element.center?.lat;
        const lon = element.type === "node" ? element.lon : element.center?.lon;

        if (lat == null || lon == null) {
            continue;
        }

        const name = element.tags?.name?.trim() ?? "";
        if (!name) {
            continue;
        }

        features.push({
            lat,
            lon,
            name,
            osmId: element.id,
            osmType: element.type,
            tags: element.tags ?? {},
        });
    }

    return features;
}

function isValidOverpassElement(
    element: OverpassElement,
): element is OverpassElement & {
    id: number;
    tags: Record<string, string>;
    type: "node" | "way" | "relation";
} {
    return (
        element.type === "node" ||
        element.type === "way" ||
        element.type === "relation"
    );
}

export function findNearestFeature(
    center: Position,
    features: OsmFeature[],
): OsmFeature | null {
    if (features.length === 0) return null;

    let nearest: OsmFeature | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    const [lon, lat] = center;

    for (const feature of features) {
        const distance = haversineDistanceMeters(
            lat,
            lon,
            feature.lat,
            feature.lon,
        );
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = feature;
        }
    }

    return nearest;
}

function haversineDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    const phi1 = toRadians(lat1);
    const phi2 = toRadians(lat2);
    const deltaPhi = toRadians(lat2 - lat1);
    const deltaLambda = toRadians(lon2 - lon1);
    const haversine =
        Math.sin(deltaPhi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    return (
        2 *
        EARTH_RADIUS_METERS *
        Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

function toRadians(value: number): number {
    return (value * Math.PI) / 180;
}
