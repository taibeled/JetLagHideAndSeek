import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Point } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    additionalMapGeoLocations,
    mapGeoLocation,
    polyGeoJSON,
} from "@/lib/context";
import {
    expandFiltersForOperatorNetwork,
    extractStationLabel,
    safeUnion,
} from "@/maps/geo-utils";
import type { APILocations } from "@/maps/schema";

import { cacheFetch, determineCache } from "./cache";
import {
    OVERPASS_API,
    OVERPASS_API_FALLBACK,
    overpassFilterForLocation,
} from "./constants";
import { prettifyLocation } from "./geo";
import type {
    EncompassingTentacleQuestionSchema,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
    QuestionSpecificLocation,
} from "./types";
import { CacheType } from "./types";

const pointCoordinates = (element: any): [number, number] | null => {
    if (typeof element?.lon === "number" && typeof element?.lat === "number") {
        return [element.lon, element.lat];
    }
    if (
        typeof element?.center?.lon === "number" &&
        typeof element?.center?.lat === "number"
    ) {
        return [element.center.lon, element.center.lat];
    }
    return null;
};

const pointName = (element: any): string | undefined => {
    const name = element?.tags?.["name:en"] ?? element?.tags?.name;
    return typeof name === "string" && name.trim() ? name : undefined;
};

const pointToFeature = (
    element: any,
    labelResolver: (element: any) => string | undefined,
): Feature<Point> | null => {
    const coordinates = pointCoordinates(element);
    const name = labelResolver(element);
    if (!coordinates || !name) return null;
    return turf.point(coordinates, { name });
};

export const elementsToPoints = (
    elements: any[],
    labelResolver: (element: any) => string | undefined,
) =>
    turf.featureCollection(
        elements.flatMap((element: any) => {
            const point = pointToFeature(element, labelResolver);
            return point ? [point] : [];
        }),
    ) as FeatureCollection<Point>;

/** Dedupe by `properties.name` — matches tentacle / zone POI picker behavior. */
export const elementsToUniqueNamedPoints = (elements: any[]) => {
    const seen = new Set<string>();
    return turf.featureCollection(
        elements.flatMap((element: any) => {
            const point = pointToFeature(element, pointName);
            if (!point) return [];

            const name = point.properties?.name;
            if (typeof name !== "string" || seen.has(name)) return [];
            seen.add(name);
            return [point];
        }),
    ) as FeatureCollection<Point>;
};

const overpassStatusMessage = (response: Response): string => {
    const code = response.status;
    if (code === 429)
        return "Overpass rate limited (429). Wait a moment before retrying.";
    if (code === 504)
        return "Overpass timed out (504). The servers may be overloaded. Try again later.";
    return `Could not load data from Overpass: ${code} ${response.statusText}`;
};

const toastOverpassError = (response: Response): void => {
    toast.error(overpassStatusMessage(response), {
        toastId: "overpass-error",
        autoClose: false,
    });
};

export const getOverpassData = async (
    query: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
    timeoutMs: number = 30_000,
    throwOnError = false,
) => {
    const encodedQuery = encodeURIComponent(query);
    const primaryUrl = `${OVERPASS_API}?data=${encodedQuery}`;
    let response = await cacheFetch(primaryUrl, loadingText, cacheType, timeoutMs);

    if (!response.ok) {
        // Try the fallback, but store the result under the primary URL key so future requests are served from cache without needing to fail-over again.
        try {
            const fallbackResponse = await cacheFetch(
                `${OVERPASS_API_FALLBACK}?data=${encodedQuery}`,
                loadingText,
                cacheType,
                timeoutMs,
            );
            if (fallbackResponse.ok) {
                const cache = await determineCache(cacheType);
                await cache.put(primaryUrl, fallbackResponse.clone());
            }
            response = fallbackResponse;
        } catch {
            toastOverpassError(response);
            if (throwOnError) throw new Error(overpassStatusMessage(response));
            return { elements: [] };
        }
    }

    if (!response.ok) {
        toastOverpassError(response);
        if (throwOnError) throw new Error(overpassStatusMessage(response));
        return { elements: [] };
    }

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
nwr${overpassFilterForLocation(question.locationType)}(around:${turf.convertLength(
        question.radius,
        question.unit,
        "meters",
    )}, ${question.lat}, ${question.lng});
out center;
    `;
    const data = await getOverpassData(query, text);
    return elementsToUniqueNamedPoints(data.elements ?? []);
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

export interface TrainLineOption {
    id: string;
    label: string;
}

type OsmObjectType = "node" | "way" | "relation";

const RAIL_ROUTE_VALUES = new Set([
    "train",
    "subway",
    "light_rail",
    "tram",
    "railway",
    "monorail",
]);

const RAILWAY_VALUES = new Set([
    "rail",
    "subway",
    "light_rail",
    "tram",
    "monorail",
    "narrow_gauge",
]);

const parseOsmObjectId = (
    osmId: string,
    allowedTypes: OsmObjectType[],
): { type: OsmObjectType; id: number } | null => {
    const match = /^(node|way|relation)\/(\d+)$/.exec(osmId);
    if (!match) return null;

    const type = match[1] as OsmObjectType;
    if (!allowedTypes.includes(type)) return null;

    return { type, id: Number(match[2]) };
};

const osmElementId = (element: any): string | null => {
    if (
        (element?.type === "way" || element?.type === "relation") &&
        Number.isFinite(element.id)
    ) {
        return `${element.type}/${element.id}`;
    }

    return null;
};

const hasRailLineTags = (
    element: any,
    tags: Record<string, unknown> = element?.tags ?? {},
): boolean => {
    if (tags.type === "route_master" || typeof tags.route_master === "string")
        return false;

    const route = tags.route;
    if (typeof route === "string" && RAIL_ROUTE_VALUES.has(route)) return true;

    const railway = tags.railway;
    if (typeof railway === "string" && RAILWAY_VALUES.has(railway)) return true;

    return false;
};

const trainLineLabel = (element: any): string => {
    const tags = element?.tags ?? {};
    const labels = [tags["name:en"], tags.name, tags.ref];
    const label = labels.find(
        (value) => typeof value === "string" && value.trim(),
    );

    if (label?.trim()) {
        return label
            .trim()
            .replace(/\s*\([^)]*(?:-->|\u2192)\s*[^)]*\)\s*/g, "")
            .trim();
    }

    return osmElementId(element) ?? "Unknown train line";
};

const stationLineRefs = (tags: Record<string, unknown> = {}): string[] => {
    const ref = tags.ref;
    if (typeof ref !== "string") return [];

    return _.uniq(
        ref
            .split(/[;/,]/)
            .map((part) => part.trim().match(/^[^\d-]+/)?.[0]?.trim())
            .filter((part): part is string => !!part),
    );
};

const trainLineRefScore = (
    element: any,
    preferredRefs: string[] = [],
): number => {
    const ref = element?.tags?.ref;
    if (preferredRefs.length === 0 || typeof ref !== "string") return 1;

    return preferredRefs.includes(ref.trim()) ? 0 : 1;
};

const disambiguateTrainLineLabels = (
    options: TrainLineOption[],
): TrainLineOption[] => {
    const labelCounts = new Map<string, number>();
    for (const option of options) {
        labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1);
    }

    const seen = new Set<string>();
    return options.flatMap((option) => {
        if (seen.has(option.label)) return [];
        seen.add(option.label);

        const dupe = (labelCounts.get(option.label) ?? 0) > 1;
        return [
            dupe
                ? { ...option, label: `${option.label} (${option.id})` }
                : option,
        ];
    });
};

export const elementsToTrainLineOptions = (
    elements: any[],
    preferredRefs: string[] = [],
): TrainLineOption[] => {
    const options = new Map<string, TrainLineOption>();
    const scores = new Map<string, number>();

    for (const element of elements) {
        const id = osmElementId(element);
        if (!id || !hasRailLineTags(element)) continue;
        const score = trainLineRefScore(element, preferredRefs);

        const existing = options.get(id);
        if (existing) {
            if (element.type === "relation" && existing.id.startsWith("way/")) {
                options.set(id, { id, label: trainLineLabel(element) });
                scores.set(id, score);
            }
            continue;
        }

        options.set(id, { id, label: trainLineLabel(element) });
        scores.set(id, score);
    }

    const sorted = [...options.values()].sort((a, b) => {
        const scoreDiff = (scores.get(a.id) ?? 1) - (scores.get(b.id) ?? 1);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.id.startsWith("relation/") && b.id.startsWith("way/"))
            return -1;
        if (a.id.startsWith("way/") && b.id.startsWith("relation/"))
            return 1;
        return 0;
    });

    return disambiguateTrainLineLabels(sorted);
};

export const extractTrainLineNodeIds = (data: any): number[] => {
    const nodes: number[] = [];
    const stationOrStopNodes = (data.elements ?? [])
        .filter(
            (element: any) =>
                element?.type === "node" &&
                Number.isFinite(element.id) &&
                (element.tags?.railway === "station" ||
                    element.tags?.public_transport === "stop_position"),
        )
        .map((element: any) => element.id);
    if (stationOrStopNodes.length > 0) return _.uniq(stationOrStopNodes);

    const geoJSON = osmtogeojson(data);

    geoJSON.features.forEach((feature: any) => {
        if (feature?.id?.startsWith("node/")) {
            nodes.push(parseInt(feature.id.split("/")[1]));
        }
    });

    (data.elements ?? []).forEach((element: any) => {
        if (element?.type === "node" && Number.isFinite(element.id)) {
            nodes.push(element.id);
        } else if (element?.type === "way" && Array.isArray(element.nodes)) {
            nodes.push(...element.nodes);
        }
    });

    return _.uniq(nodes);
};

export const extractTrainLineStationLabels = (
    data: any,
    strategy: "english-preferred" | "native-preferred" = "english-preferred",
): string[] => {
    const stationElements = (data.elements ?? []).filter(
        (element: any) =>
            element?.type === "node" &&
            element.tags?.railway === "station" &&
            (element.tags.name || element.tags["name:en"]),
    );
    const fallbackElements = (data.elements ?? []).filter(
        (element: any) =>
            element?.type === "node" &&
            element.tags?.public_transport === "stop_position" &&
            (element.tags.name || element.tags["name:en"]),
    );
    const elements =
        stationElements.length > 0 ? stationElements : fallbackElements;
    const lineRefs = (data.elements ?? [])
        .map((element: any) => element?.tags?.ref)
        .filter((ref: unknown): ref is string => typeof ref === "string");
    const sortRef = (ref: unknown) => {
        if (typeof ref !== "string") return "";
        const parts = ref.split(";").map((part) => part.trim());
        return (
            parts.find((part) =>
                lineRefs.some((lineRef) => part.startsWith(lineRef)),
            ) ?? ref
        );
    };
    const fallbackRefByLabel = new Map<string, string>();
    for (const element of fallbackElements) {
        const label = element.tags?.["name:en"] ?? element.tags?.name;
        const ref = element.tags?.ref;
        if (typeof label === "string" && typeof ref === "string") {
            fallbackRefByLabel.set(label, ref);
        }
    }

    const labels = elements
        .map((element: any) => ({
            label: extractStationLabel(
                {
                    properties: element.tags,
                    geometry: { coordinates: [element.lon, element.lat] },
                },
                strategy,
            ),
            ref:
                element.tags?.ref ??
                fallbackRefByLabel.get(
                    element.tags?.["name:en"] ?? element.tags?.name,
                ),
        }))
        .filter((station: { label?: string }) => !!station.label)
        .sort((a: { ref?: string }, b: { ref?: string }) =>
            sortRef(a.ref).localeCompare(sortRef(b.ref), undefined, {
                numeric: true,
                sensitivity: "base",
            }),
        )
        .map((station: { label: string }) => station.label);

    return Array.from(new Set(labels));
};

export const fetchStationTrainLineOptions = async (
    stationOsmId: string,
): Promise<TrainLineOption[]> => {
    const station = parseOsmObjectId(stationOsmId, ["node"]);
    if (!station) return [];

    const stationQuery = `
[out:json];
node(${station.id});
out body;
`;
    const stationData = await getOverpassData(
        stationQuery,
        "Finding train lines...",
        CacheType.CACHE,
        undefined,
        true,
    );
    const stationElement = stationData.elements?.find(
        (element: any) => element?.type === "node" && element?.id === station.id,
    );
    if (
        !Number.isFinite(stationElement?.lat) ||
        !Number.isFinite(stationElement?.lon)
    ) {
        return [];
    }

    const query = `
[out:json];
(
rel(around:300, ${stationElement.lat}, ${stationElement.lon})["route"~"^(${[
        ...RAIL_ROUTE_VALUES,
    ].join("|")})$"];
way(around:100, ${stationElement.lat}, ${stationElement.lon})["railway"~"^(${[
        ...RAILWAY_VALUES,
    ].join("|")})$"];
);
out tags;
`;
    const data = await getOverpassData(
        query,
        "Finding train lines...",
        CacheType.CACHE,
        undefined,
        true,
    );
    return elementsToTrainLineOptions(
        data.elements ?? [],
        stationLineRefs(stationElement.tags),
    );
};

const exactTrainLineQuery = (lineOsmId: string): string | null => {
    const line = parseOsmObjectId(lineOsmId, ["way", "relation"]);
    if (!line) return null;

    if (line.type === "way") {
        return `
[out:json];
way(${line.id});
(._;>;);
out geom;
`;
    }

    return `
[out:json];
relation(${line.id})->.line;
way(r.line)->.lineWays;
node(w.lineWays)->.lineWayNodes;
node(r.line)->.lineRelationNodes;
rel(bn.lineRelationNodes)["public_transport"="stop_area"]->.stopAreas;
node(r.stopAreas)["railway"="station"]->.stopAreaStations;
(.line; .lineWays; .lineWayNodes; .lineRelationNodes; .stopAreas; .stopAreaStations;);
out geom;
`;
};

export const findNodesOnTrainLine = async (
    lineOsmId: string,
): Promise<number[]> => {
    const query = exactTrainLineQuery(lineOsmId);
    if (!query) return [];

    const data = await getOverpassData(
        query,
        "Finding train line...",
        CacheType.CACHE,
        undefined,
        true,
    );
    return extractTrainLineNodeIds(data);
};

export const findStationLabelsOnTrainLine = async (
    lineOsmId: string,
    strategy: "english-preferred" | "native-preferred" = "english-preferred",
): Promise<string[]> => {
    const query = exactTrainLineQuery(lineOsmId);
    if (!query) return [];

    const data = await getOverpassData(
        query,
        "Finding train line...",
        CacheType.CACHE,
        undefined,
        true,
    );
    return extractTrainLineStationLabels(data, strategy);
};

export const trainLineNodeFinder = async (node: string): Promise<number[]> => {
    try {
        const options = await fetchStationTrainLineOptions(node);
        const selectedLine = options.find((option) =>
            option.id.startsWith("relation/"),
        );
        if (selectedLine) {
            return findNodesOnTrainLine(selectedLine.id);
        }

        const nodeId = node.split("/")[1];
        const tagQuery = `
[out:json];
node(${nodeId});
wr(bn);
out tags;
`;
        const tagData = await getOverpassData(
            tagQuery,
            "Finding train line...",
        );
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
        return extractTrainLineNodeIds(data);
    } catch {
        return [];
    }
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
    operatorFilter: string[] = [],
) => {
    const { primaryLines, alternativeLines } = expandFiltersForOperatorNetwork(
        filter,
        alternatives,
        operatorFilter,
    );

    let query = "";
    const $polyGeoJSON = polyGeoJSON.get();
    if ($polyGeoJSON) {
        const polyQuoted = turf
            .getCoords($polyGeoJSON.features)
            .flatMap((polygon) => polygon.geometry.coordinates)
            .flat()
            .map((coord) => [coord[1], coord[0]].join(" "))
            .join(" ");
        const unionLines = [...primaryLines, ...alternativeLines]
            .map((f) => `${searchType}${f}(poly:"${polyQuoted}");`)
            .join("\n");
        query = `
[out:json]${timeoutDuration != 0 ? `[timeout:${timeoutDuration}]` : ""};
(
${unionLines}
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
        const allFilterLines = [...primaryLines, ...alternativeLines];
        const searchBlocks = allLocations
            .map((_, idx) => {
                const regionVar = `area.region${idx}`;
                return allFilterLines
                    .map((f) => `${searchType}${f}(${regionVar});`)
                    .join("\n");
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

    if (
        operatorFilter.length > 0 &&
        data &&
        Array.isArray(data.elements) &&
        data.elements.length > 0
    ) {
        const seen = new Set<string>();
        data.elements = data.elements.filter((el: any) => {
            const key = `${el.type}/${el.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    return data;
};

/** POIs for home-game POI categories (measuring / matching) — scoped like `findPlacesInZone` (play region). */
export const findHomeGamePoiPointsInPlayZone = async (
    locationType: APILocations,
    loadingText?: string,
) => {
    const label = prettifyLocation(locationType, true).toLowerCase();
    const data = await findPlacesInZone(
        overpassFilterForLocation(locationType),
        loadingText ?? `Finding ${label}...`,
        "nwr",
        "center",
        [],
        60,
    );

    if (data.remark && data.remark.startsWith("runtime error")) {
        toast.error(
            `Error finding ${label}. Please enable hiding zone mode and switch to the Large Game variation of this question.`,
        );
        return turf.featureCollection([]);
    }

    const els = data.elements ?? [];
    if (els.length >= 1000) {
        toast.error(
            `Too many ${label} found (${els.length}). Please enable hiding zone mode and switch to the Large Game variation of this question.`,
        );
        return turf.featureCollection([]);
    }

    return elementsToUniqueNamedPoints(els);
};

export const findAirportPointsInPlayZone = async () =>
    elementsToPoints(
        (
            await findPlacesInZone(
                '["aeroway"="aerodrome"]["iata"]',
                "Finding airports...",
            )
        ).elements,
        (element) =>
            pointName(element) ??
            (typeof element?.tags?.iata === "string" && element.tags.iata.trim()
                ? element.tags.iata
                : undefined),
    );

export const findCityPointsInPlayZone = async () =>
    elementsToPoints(
        (
            await findPlacesInZone(
                '[place=city]["population"~"^[1-9]+[0-9]{6}$"]',
                "Finding cities...",
            )
        ).elements,
        pointName,
    );

export const findBrandPointsInZone = async (
    location: `${QuestionSpecificLocation}`,
) =>
    elementsToPoints(
        (
            await findPlacesInZone(
                location,
                `Finding ${
                    location === '["brand:wikidata"="Q38076"]'
                        ? "McDonald's"
                        : "7-Elevens"
                }...`,
            )
        ).elements,
        (element) =>
            pointName(element) ??
            (typeof element?.tags?.brand === "string" &&
            element.tags.brand.trim()
                ? element.tags.brand
                : undefined) ??
            (typeof element?.tags?.operator === "string" &&
            element.tags.operator.trim()
                ? element.tags.operator
                : undefined),
    );

export const findPlacesSpecificInZone = async (
    location: `${QuestionSpecificLocation}`,
) => {
    return findBrandPointsInZone(location);
};

export const findHighSpeedRailFeatures = async (): Promise<Feature[]> =>
    osmtogeojson(
        await findPlacesInZone(
            "[highspeed=yes]",
            "Finding high-speed lines...",
            "nwr",
            "geom",
        ),
    ).features as Feature[];

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
