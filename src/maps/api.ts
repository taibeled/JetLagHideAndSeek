import type { LatLngTuple } from "leaflet";
import osmtogeojson from "osmtogeojson";
import type { TentacleQuestion, TentacleLocations } from "./tentacles";
import * as turf from "@turf/turf";
import { mapGeoLocation, polyGeoJSON } from "@/lib/context";
import _ from "lodash";
import { toast } from "react-toastify";

export interface OpenStreetMap {
    type: string;
    geometry: OpenStreetMapGeometry;
    properties: OpenStreetMapProperties;
}

interface OpenStreetMapGeometry {
    type: string;
    coordinates: LatLngTuple;
}

interface OpenStreetMapProperties {
    osm_type: "W" | "R" | "N";
    osm_id: number;
    extent?: number[];
    country?: string;
    state?: string;
    osm_key: string;
    countrycode: string;
    osm_value: string;
    name: string;
    type: string;
    isHidingZone?: boolean;
}

export const OVERPASS_API = "https://overpass-api.de/api/interpreter";
export const GEOCODER_API = "https://photon.komoot.io/api/";

export const iconColors = {
    black: "#3D3D3D",
    blue: "#2A81CB",
    gold: "#FFD326",
    green: "#2AAD27",
    grey: "#7B7B7B",
    orange: "#CB8427",
    red: "#CB2B3E",
    violet: "#9C2BCB",
};

export const getOverpassData = async (
    query: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
) => {
    const response = await cacheFetch(
        `${OVERPASS_API}?data=${encodeURIComponent(query)}`,
        loadingText,
        cacheType,
    );
    const data = await response.json();
    return data;
};

export const determineGeoJSON = async (
    osmId: string,
    osmTypeLetter: "W" | "R" | "N",
): Promise<any> => {
    const osmTypeMap: { [key: string]: string } = {
        W: "way",
        R: "relation",
        N: "node",
    };

    const osmType = osmTypeMap[osmTypeLetter];

    const query = `[out:json];${osmType}(${osmId});out geom;`;
    const data = await getOverpassData(
        query,
        "Loading map data...",
        CacheType.PERMANENT_CACHE, // Speedy switching
    );

    const geo = osmtogeojson(data);

    return {
        ...geo,
        features: geo.features.filter((feature: any) => {
            if (feature.geometry.type === "Point") {
                return false;
            }
            return true;
        }),
    };
};

const tentacleFirstTag: { [key in TentacleLocations]: "amenity" | "tourism" } =
    {
        aquarium: "tourism",
        hospital: "amenity",
        museum: "tourism",
        theme_park: "tourism",
        zoo: "tourism",
        cinema: "amenity",
        library: "amenity",
    };

export const findTentacleLocations = async (question: TentacleQuestion) => {
    const query = `
[out:json][timeout:25];
nw["${tentacleFirstTag[question.locationType]}"="${
        question.locationType
    }"](around:${turf.convertLength(
        question.radius,
        question.unit ?? "miles",
        "meters",
    )}, ${question.lat}, ${question.lng});
out center;
    `;
    const data = await getOverpassData(
        query,
        "Determining tentacle locations...",
    );

    const elements = data.elements;

    const response = turf.points([]);

    elements.forEach((element: any) => {
        if (!element.tags["name"] && !element.tags["name:en"]) return;
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
            turf.point([element.center.lon, element.center.lat], {
                name,
            }),
        );
    });

    return response;
};

export const findAdminBoundary = async (
    latitude: number,
    longitude: number,
    adminLevel: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
) => {
    const query = `
[out:json];
is_in(${latitude}, ${longitude})->.a;
rel(pivot.a)["admin_level"="${adminLevel}"];
out geom;
    `;

    const data = await getOverpassData(query, "Determining matching zone...");

    const geo = osmtogeojson(data);

    return geo.features?.[0];
};

export const geocode = async (address: string, language: string) => {
    const features = (
        await (
            await fetch(`${GEOCODER_API}?lang=${language}&q=${address}`)
        ).json()
    ).features as OpenStreetMap[];

    features.forEach((feature) => {
        feature.geometry.coordinates = convertToLatLong(
            feature.geometry.coordinates as number[],
        );
        if (!feature.properties.extent) return;
        feature.properties.extent = [
            feature.properties.extent[1],
            feature.properties.extent[0],
            feature.properties.extent[3],
            feature.properties.extent[2],
        ];
    });

    return _.uniqBy(
        features.filter((feature) => {
            return feature.properties.osm_type === "R";
        }),
        (feature) => feature.properties.osm_id,
    );
};

export const determineName = (feature: OpenStreetMap) => {
    if (feature.properties.state) {
        return `${feature.properties.name}, ${feature.properties.state}, ${feature.properties.country}`;
    } else if (feature.properties.country) {
        return `${feature.properties.name}, ${feature.properties.country}`;
    } else {
        return feature.properties.name;
    }
};

export const convertToLongLat = (coordinates: LatLngTuple): number[] => {
    return [coordinates[1], coordinates[0]];
};

export const convertToLatLong = (coordinates: number[]): LatLngTuple => {
    return [coordinates[1], coordinates[0]];
};

export const fetchCoastline = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/coastline50.geojson",
        "Fetching coastline data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
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
    alternative?: string,
) => {
    let query = "";

    const $polyGeoJSON = polyGeoJSON.get();

    if ($polyGeoJSON) {
        query = `
[out:json];
(
${searchType}${filter}(poly:"${turf
            .getCoords($polyGeoJSON.features)
            .flatMap((polygon) => polygon.geometry.coordinates)
            .flat()
            .map((coord) => [coord[1], coord[0]].join(" "))
            .join(" ")}");
${
    alternative
        ? `${searchType}${alternative}(poly:"${turf
              .getCoords($polyGeoJSON.features)
              .flatMap((polygon) => polygon.geometry.coordinates)
              .flat()
              .map((coord) => [coord[1], coord[0]].join(" "))
              .join(" ")}");`
        : ""
}
);
out ${outType};
`;
    } else {
        const geoLocation = mapGeoLocation.get();

        query = `
[out:json];
relation(${geoLocation.properties.osm_id});map_to_area->.region;
(
${searchType}${filter}(area.region);
${alternative ? `${searchType}${alternative}(area.region);` : ""}
);
out ${outType};
`;
    }

    return await getOverpassData(query, loadingText, CacheType.ZONE_CACHE);
};

export enum CacheType {
    CACHE = "jlhs-map-generator-cache",
    ZONE_CACHE = "jlhs-map-generator-zone-cache",
    PERMANENT_CACHE = "jlhs-map-generator-permanent-cache",
}

const determineQuestionCache = _.memoize(() => caches.open(CacheType.CACHE));
const determineZoneCache = _.memoize(() => caches.open(CacheType.ZONE_CACHE));
const determinePermanentCache = _.memoize(() =>
    caches.open(CacheType.PERMANENT_CACHE),
);

const determineCache = async (cacheType: CacheType) => {
    switch (cacheType) {
        case CacheType.CACHE:
            return await determineQuestionCache();
        case CacheType.ZONE_CACHE:
            return await determineZoneCache();
        case CacheType.PERMANENT_CACHE:
            return await determinePermanentCache();
    }
};

const cacheFetch = async (
    url: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
) => {
    try {
        const cache = await determineCache(cacheType);

        const cachedResponse = await cache.match(url);
        if (cachedResponse) return cachedResponse;

        if (loadingText) {
            return toast.promise(
                async () => {
                    const response = await fetch(url);
                    await cache.put(url, response.clone());
                    return response;
                },
                {
                    pending: loadingText,
                },
            );
        }

        const response = await fetch(url);
        await cache.put(url, response.clone());
        return response;
    } catch (e) {
        console.log(e); // Probably a caches not supported error

        return fetch(url);
    }
};

export const clearCache = async (cacheType: CacheType = CacheType.CACHE) => {
    const cache = await determineCache(cacheType);
    await cache.keys().then((keys) => {
        keys.forEach((key) => {
            cache.delete(key);
        });
    });
};
