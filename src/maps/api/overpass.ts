import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon, Point } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";

import {
    additionalMapGeoLocations,
    mapGeoLocation,
    polyGeoJSON,
} from "@/lib/context";
import { safeUnion } from "@/maps/geo-utils";

import { cacheFetch } from "./cache";
import { LOCATION_FIRST_TAG, OVERPASS_API } from "./constants";
import type {
    EncompassingTentacleQuestionSchema,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
    QuestionSpecificLocation,
} from "./types";
import { CacheType } from "./types";

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

export const findNearbyStreetNetwork = async (
    latitude: number,
    longitude: number,
    radiusMeters: number = 250,
) => {
    const query = `
[out:json][timeout:25];
(
  way(around:${radiusMeters}, ${latitude}, ${longitude})["highway"];
);
out geom;
`;

    const data = await getOverpassData(query, "Finding nearby streets...");
    const geo = osmtogeojson(data);

    return turf.featureCollection(
        geo.features.filter(
            (feature: any) =>
                feature?.geometry?.type === "LineString" ||
                feature?.geometry?.type === "MultiLineString",
        ),
    );
};

export const findAdminBoundary = async (
    latitude: number,
    longitude: number,
    adminLevel: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
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
        if (element.tags.name) query += `wr["name"="${element.tags.name}"];`;
        if (element.tags["name:en"])
            query += `wr["name:en"="${element.tags["name:en"]}"];`;
        if (element.tags["network"])
            query += `wr["network"="${element.tags["network"]}"];`;
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
        if (feature && feature.id && feature.id.startsWith("node")) {
            nodes.push(parseInt(feature.id.split("/")[1]));
        }
    });
    data.elements.forEach((element: any) => {
        if (element && element.type === "node") {
            nodes.push(element.id);
        } else if (element && element.type === "way") {
            nodes.push(...element.nodes);
        }
    });
    const uniqNodes = _.uniq(nodes);
    return uniqNodes;
};

const SYDNEY_RAIL_LINE_PATTERN = /(T[1-9]|M1|L[1-4])/gi;
const SUPPORTED_SYDNEY_RAIL_LINES = new Set([
    "L1",
    "L2",
    "L3",
    "L4",
    "M1",
    "T1",
    "T2",
    "T3",
    "T4",
    "T5",
    "T8",
    "T9",
]);
const SYDNEY_MANUAL_SELECTION_EXCLUDED_STATIONS = new Set([
    "central",
    "town hall",
    "st james",
    "museum",
    "circular quay",
]);

const normalizeStationName = (name: string) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

const normalizeSydneyRailLineRefs = (value?: string) => {
    if (!value) return [] as string[];

    const matches = value.match(SYDNEY_RAIL_LINE_PATTERN) ?? [];

    return matches
        .map((line) => line.toUpperCase())
        .filter((line) => SUPPORTED_SYDNEY_RAIL_LINES.has(line));
};

export const sydneyRailLineRefsForStation = async (
    node: string,
): Promise<string[]> => {
    const nodeId = node.split("/")[1];
    const stationNodeId = parseInt(nodeId, 10);

    if (!Number.isFinite(stationNodeId)) {
        return [];
    }

    const stationData = await getOverpassData(
        `
[out:json];
node(${stationNodeId});
out body;
`,
        "Finding station details...",
    );

    const stationNode = stationData.elements?.find(
        (element: any) =>
            element?.type === "node" && element?.id === stationNodeId,
    );

    if (!stationNode || stationNode.lat === undefined || stationNode.lon === undefined) {
        return [];
    }

    const routeData = await getOverpassData(
        `
[out:json];
node(${stationNodeId})->.station;
(
    relation(bn.station)["type"="route"]["route"~"^(train|light_rail|subway)$"]["ref"];
    relation(bn.station)["type"="route_master"]["route_master"~"^(train|light_rail|subway)$"]["ref"];

    way(around.station:180)["railway"="platform"]->.platforms;
    relation(bw.platforms)["type"="route"]["route"~"^(train|light_rail|subway)$"]["ref"];
    relation(bw.platforms)["type"="route_master"]["route_master"~"^(train|light_rail|subway)$"]["ref"];

    node(around.station:180)["public_transport"="stop_position"]->.stops;
    relation(bn.stops)["type"="route"]["route"~"^(train|light_rail|subway)$"]["ref"];
    relation(bn.stops)["type"="route_master"]["route_master"~"^(train|light_rail|subway)$"]["ref"];
);
out tags;
`,
        "Finding Sydney rail lines...",
    );

    const lines = _.uniq(
        (routeData.elements ?? []).flatMap((element: any) => {
            const tags = element?.tags ?? {};
            return _.uniq([
                ...normalizeSydneyRailLineRefs(tags.ref),
                ...normalizeSydneyRailLineRefs(tags.short_name),
                ...normalizeSydneyRailLineRefs(tags.name),
            ]);
        }),
    );

    return lines;
};

export const nearestSydneyStationLineContext = async (
    latitude: number,
    longitude: number,
) => {
    const places = osmtogeojson(
        await findPlacesInZone(
            "[railway=station]",
            "Finding train stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
            "node",
        ),
    ) as FeatureCollection;

    if (!places?.features?.length) {
        return null;
    }

    const nearestStation = turf.nearestPoint(
        turf.point([longitude, latitude]),
        places as any,
    ) as any;

    const stationId = nearestStation?.properties?.id;

    if (!stationId || typeof stationId !== "string") {
        return null;
    }

    const stationName =
        nearestStation.properties?.["name:en"] ??
        nearestStation.properties?.name ??
        "Unknown station";

    const lines = await sydneyRailLineRefsForStation(stationId);
    const requiresManualSelection =
        lines.length > 1 &&
        !SYDNEY_MANUAL_SELECTION_EXCLUDED_STATIONS.has(
            normalizeStationName(stationName),
        );

    return {
        stationId,
        stationName,
        lines,
        requiresManualSelection,
    };
};

export const sydneyStationNodeIdsForLineRefs = async (lineRefs: string[]) => {
        const refs = _.uniq(
                lineRefs
                        .map((ref) => ref.toUpperCase().trim())
                        .filter((ref) => SUPPORTED_SYDNEY_RAIL_LINES.has(ref)),
        );

        if (refs.length === 0) {
                return [] as number[];
        }

        const refPattern = refs.join("|");

        const data = await getOverpassData(
                `
[out:json][timeout:60];
(
    relation["type"="route"]["route"~"^(train|light_rail|subway)$"]["ref"~"^(${refPattern})$"];
)->.directRoutes;

(
    relation["type"="route_master"]["route_master"~"^(train|light_rail|subway)$"]["ref"~"^(${refPattern})$"];
)->.masters;

rel(r.masters)["type"="route"]->.masterRoutes;

(
    .directRoutes;
    .masterRoutes;
)->.allRoutes;

(
    node(r.allRoutes)["railway"~"^(station|halt|tram_stop)$"];
    node(r.allRoutes)["public_transport"="station"];
);
out body;
`,
                "Finding stations on selected Sydney line...",
        );

        return _.uniq(
                (data.elements ?? [])
                        .filter((element: any) => element?.type === "node")
                        .map((element: any) => element.id as number),
        );
};

export const sydneyStationPointsForLineRefs = async (lineRefs: string[]) => {
    const refs = _.uniq(
        lineRefs
            .map((ref) => ref.toUpperCase().trim())
            .filter((ref) => SUPPORTED_SYDNEY_RAIL_LINES.has(ref)),
    );

    if (refs.length === 0) {
        return turf.featureCollection([] as any[]) as FeatureCollection<Point>;
    }

    const refPattern = refs.join("|");
    const tokenAwareRefPattern = `(^|[^A-Z0-9])(${refPattern})([^A-Z0-9]|$)`;

    const data = await findPlacesInZone(
        '["railway"~"^(station|halt|tram_stop)$"]["route_ref"~"' +
            tokenAwareRefPattern +
            '"]',
        "Finding stations on selected Sydney line...",
        "nwr",
        "center",
        [
            '["public_transport"="station"]["route_ref"~"' +
                tokenAwareRefPattern +
                '"]',
            '["railway"~"^(station|halt|tram_stop)$"]["line"~"' +
                tokenAwareRefPattern +
                '"]',
            '["public_transport"="station"]["line"~"' +
                tokenAwareRefPattern +
                '"]',
        ],
        60,
    );

    const points = data.elements
        .map((element: any) => {
            const lon = element.center?.lon ?? element.lon;
            const lat = element.center?.lat ?? element.lat;
            if (typeof lon !== "number" || typeof lat !== "number") {
                return null;
            }
            return turf.point([lon, lat], {
                ...element.tags,
                osmType: element.type,
                osmId: element.id,
            });
        })
        .filter((feature: any) => feature !== null);

    return turf.featureCollection(points) as FeatureCollection<Point>;
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
        const primaryLocation = mapGeoLocation.get();
        const additionalLocations = additionalMapGeoLocations
            .get()
            .filter((entry) => entry.added)
            .map((entry) => entry.location);
        const allLocations = [primaryLocation, ...additionalLocations];
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
                                  (alt) => `${searchType}${alt}(${regionVar});`,
                              )
                              .join("\n")
                        : "";
                return `
            ${searchType}${filter}(${regionVar});
            ${altQueries}
          `;
            })
            .join("\n");
        query = `
        [out:json]${timeoutDuration !== 0 ? `[timeout:${timeoutDuration}]` : ""};
        ${relationToAreaBlocks}
        (
        ${searchBlocks}
        );
        out ${outType};
        `;
    }
    const data = await getOverpassData(
        query,
        loadingText,
        CacheType.ZONE_CACHE,
    );
    const subtractedEntries = additionalMapGeoLocations
        .get()
        .filter((e) => !e.added);
    const subtractedPolygons = subtractedEntries.map((entry) => entry.location);
    if (subtractedPolygons.length > 0 && data && data.elements) {
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
    return data;
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
                    : location ===
                        '["amenity"="place_of_worship"]["religion"="jewish"]'
                      ? "Synagogues"
                      : "7-Elevens"
            }...`,
        )
    ).elements;
    return turf.featureCollection(
        locations.map((x: any) =>
            turf.point([
                x.center ? x.center.lon : x.lon,
                x.center ? x.center.lat : x.lat,
            ], {
                id: `${x.type}/${x.id}`,
                name: x.tags?.["name:en"] ?? x.tags?.name,
            }),
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
                unit: "kilometers",
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

export const determineMapBoundaries = async () => {
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
