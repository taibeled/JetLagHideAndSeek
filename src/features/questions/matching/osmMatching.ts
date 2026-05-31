import {
    type Position,
    haversineDistanceMeters,
} from "@/shared/geojson";
import type { MatchingCategory, OsmFeature } from "./matchingTypes";
import { getCategoryConfig } from "./matchingCategories";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const DEFAULT_SEARCH_RADIUS_METERS = 50_000;

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
    options?: {
        maxCandidates?: number;
        searchRadiusMeters?: number;
        signal?: AbortSignal;
    },
): Promise<OsmFeatureWithDistance[]> {
    const config = getCategoryConfig(category);
    if (!config) {
        return [];
    }

    if (!config.osmQueryTags && category !== "station-name-length") {
        return [];
    }

    const searchRadiusMeters =
        options?.searchRadiusMeters ?? DEFAULT_SEARCH_RADIUS_METERS;
    const maxCandidates = options?.maxCandidates ?? 10;
    const [lon, lat] = center;
    const query =
        category === "station-name-length"
            ? buildStationQuery(lat, lon, searchRadiusMeters)
            : buildOverpassQuery(
                  config.osmQueryTags,
                  lat,
                  lon,
                  searchRadiusMeters,
              );

    const response = await fetch(
        `${OVERPASS_API}?data=${encodeURIComponent(query)}`,
        { signal: options?.signal },
    );

    if (!response.ok) {
        throw new Error(`Overpass API error ${response.status}`);
    }

    const data = (await response.json()) as OverpassResponse;
    const features = parseOverpassElements(data.elements ?? [], category);

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

function buildStationQuery(
    lat: number,
    lon: number,
    radiusMeters: number,
): string {
    // Query both railway stations and subway stations to cover transit broadly.
    const around = `(around:${radiusMeters},${lat},${lon})`;
    return `[out:json][timeout:30];
(
  node["railway"="station"]${around};
  way["railway"="station"]${around};
  node["station"="subway"]["railway"="station"]${around};
  way["station"="subway"]["railway"="station"]${around};
);
out center tags qt;`;
}

export function parseOverpassElements(
    elements: OverpassElement[],
    category?: string,
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

        const feature: OsmFeature = {
            lat,
            lon,
            name,
            osmId: element.id,
            osmType: element.type,
            tags: element.tags ?? {},
        };

        // For station-name-length, use the English name (name:en) when
        // available, and record the character length for comparison.
        if (category === "station-name-length") {
            const englishName = element.tags?.["name:en"]?.trim();
            const displayName = englishName || name;
            feature.name = displayName;
            feature.nameLength = displayName.length;
        }

        features.push(feature);
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
