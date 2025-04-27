import type { LatLngTuple } from "leaflet";
import osmtogeojson from "osmtogeojson";
import * as turf from "@turf/turf";
import { mapGeoLocation, polyGeoJSON } from "@/lib/context";
import type { Question, TraditionalTentacleQuestion } from "@/lib/schema";
import _ from "lodash";
import { toast } from "react-toastify";
import type {
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
    TentacleLocations,
} from "@/lib/schema";

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
    questions?: Question[];
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

export const locationFirstTag: {
    [key in TentacleLocations]:
        | "amenity"
        | "tourism"
        | "leisure"
        | "diplomatic";
} = {
    aquarium: "tourism",
    hospital: "amenity",
    museum: "tourism",
    theme_park: "tourism",
    zoo: "tourism",
    cinema: "amenity",
    library: "amenity",
    golf_course: "leisure",
    consulate: "diplomatic",
    park: "leisure",
};

export const findTentacleLocations = async (
    question: TraditionalTentacleQuestion,
    text: string = "Determining tentacle locations...",
) => {
    const query = `
[out:json][timeout:25];
nwr["${locationFirstTag[question.locationType]}"="${
        question.locationType
    }"](around:${turf.convertLength(
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
                turf.point([element.lon, element.lat], {
                    name,
                }),
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

export const trainLineNodeFinder = async (node: string): Promise<number[]> => {
    const nodeId = node.split("/")[1];

    const tagQuery = `
[out:json];
node(${nodeId});
wr(bn);
out tags;
`;

    const tagData = await getOverpassData(tagQuery, "Finding train line...");

    const query = `
[out:json];
(
${tagData.elements
    .map((element: any) => {
        if (
            !element.tags.name &&
            !element.tags["name:en"] &&
            !element.tags.network
        )
            return "";

        let query = "";

        if (element.tags.name) {
            query += `wr["name"="${element.tags.name}"];`;
        }

        if (element.tags["name:en"]) {
            query += `wr["name:en"="${element.tags["name:en"]}"];`;
        }

        if (element.tags["network"]) {
            query += `wr["network"="${element.tags["network"]}"];`;
        }

        return query;
    })
    .join("\n")}
);
out geom;
`;

    const data = await getOverpassData(query, "Finding train lines...");

    const geoJSON = osmtogeojson(data);

    const nodes: number[] = [];

    geoJSON.features.forEach((feature: any) => {
        // For relations
        if (feature && feature.id && feature.id.startsWith("node")) {
            nodes.push(parseInt(feature.id.split("/")[1]));
        }
    });

    data.elements.forEach((element: any) => {
        // For ways
        if (element && element.type === "node") {
            nodes.push(element.id);
        } else if (element && element.type === "way") {
            nodes.push(...element.nodes);
        }
    });

    const uniqNodes = _.uniq(nodes);

    return uniqNodes;
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
) => {
    let query = "";

    const $polyGeoJSON = polyGeoJSON.get();

    if ($polyGeoJSON) {
        query = `
[out:json]${timeoutDuration != 0 ? `[timeout:${timeoutDuration}]` : ""};
(
${searchType}${filter}(poly:"${turf
            .getCoords($polyGeoJSON.features)
            .flatMap((polygon) => polygon.geometry.coordinates)
            .flat()
            .map((coord) => [coord[1], coord[0]].join(" "))
            .join(" ")}");
${
    alternatives.length > 0
        ? alternatives
              .map(
                  (alternative) =>
                      `${searchType}${alternative}(poly:"${turf
                          .getCoords($polyGeoJSON.features)
                          .flatMap((polygon) => polygon.geometry.coordinates)
                          .flat()
                          .map((coord) => [coord[1], coord[0]].join(" "))
                          .join(" ")}");`,
              )
              .join("\n")
        : ""
}
);
out ${outType};
`;
    } else {
        const geoLocation = mapGeoLocation.get();

        query = `
[out:json]${timeoutDuration != 0 ? `[timeout:${timeoutDuration}]` : ""};
relation(${geoLocation.properties.osm_id});map_to_area->.region;
(
${searchType}${filter}(area.region);
${alternatives.length > 0 ? alternatives.map((alternative) => `${searchType}${alternative}(area.region);`).join("\n") : ""}
);
out ${outType};
`;
    }

    return await getOverpassData(query, loadingText, CacheType.ZONE_CACHE);
};

export const findPlacesSpecificInZone = async (
    location: QuestionSpecificLocation,
) => {
    const locations = (
        await findPlacesInZone(
            location,
            `Finding ${
                location === QuestionSpecificLocation.McDonalds
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

export enum QuestionSpecificLocation {
    McDonalds = '["brand:wikidata"="Q38076"]',
    Seven11 = '["brand:wikidata"="Q259340"]',
}

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
    try {
        const cache = await determineCache(cacheType);
        await cache.keys().then((keys) => {
            keys.forEach((key) => {
                cache.delete(key);
            });
        });
    } catch (e) {
        console.log(e); // Probably a caches not supported error
    }
};

export const prettifyLocation = (location: TentacleLocations) => {
    switch (location) {
        case "aquarium":
            return "Aquarium";
        case "hospital":
            return "Hospital";
        case "museum":
            return "Museum";
        case "theme_park":
            return "Theme Park";
        case "zoo":
            return "Zoo";
        case "cinema":
            return "Cinema";
        case "library":
            return "Library";
        case "golf_course":
            return "Golf Course";
        case "consulate":
            return "Foreign Consulate";
        case "park":
            return "Park";
    }
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
            },
            "Finding matching locations...",
        );
        radius += 30;
    }

    const questionPoint = turf.point([question.lng, question.lat]);

    return turf.nearestPoint(questionPoint, instances as any);
};
