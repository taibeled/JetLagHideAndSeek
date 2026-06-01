export type PlayAreaSearchResult = {
    country?: string;
    label: string;
    osmId: number;
    state?: string;
};

type PhotonFeature = {
    properties: {
        country?: string;
        name?: string;
        osm_id?: number;
        osm_type?: string;
        state?: string;
    };
};

const MAX_CACHE_SIZE = 50;

/** Simple LRU cache for Photon search results. Map preserves insertion order
 *  so we can evict the oldest entry when the cache exceeds MAX_CACHE_SIZE. */
const searchCache = new Map<string, PlayAreaSearchResult[]>();

export function clearPlayAreaSearchCache() {
    searchCache.clear();
}

function normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
}

export async function searchPlayAreas(
    query: string,
): Promise<PlayAreaSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const key = normalizeQuery(trimmed);
    const cached = searchCache.get(key);
    if (cached) {
        // Move to end (most-recently-used) by re-inserting.
        searchCache.delete(key);
        searchCache.set(key, cached);
        return cached;
    }

    const response = await fetch(
        `https://photon.komoot.io/api/?lang=en&q=${encodeURIComponent(trimmed)}&limit=10`,
    );
    if (!response.ok) {
        throw new Error(`Photon search error ${response.status}`);
    }

    const data = (await response.json()) as { features?: PhotonFeature[] };
    const results = mapPhotonFeaturesToPlayAreaResults(data.features ?? []);

    // Evict oldest entry when cache exceeds max size.
    if (searchCache.size >= MAX_CACHE_SIZE) {
        const oldest = searchCache.keys().next().value;
        if (oldest !== undefined) searchCache.delete(oldest);
    }
    searchCache.set(key, results);

    return results;
}

export function mapPhotonFeaturesToPlayAreaResults(
    features: PhotonFeature[],
): PlayAreaSearchResult[] {
    const seen = new Set<number>();
    const results: PlayAreaSearchResult[] = [];

    for (const feature of features) {
        const { osm_id: osmId, osm_type: osmType, name } = feature.properties;
        if (osmType !== "R" || typeof osmId !== "number" || !name) continue;
        if (seen.has(osmId)) continue;

        seen.add(osmId);
        results.push({
            country: feature.properties.country,
            label: name,
            osmId,
            state: feature.properties.state,
        });
    }

    return results;
}
