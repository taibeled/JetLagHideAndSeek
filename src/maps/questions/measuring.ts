import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Point } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    hiderMode,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    questionModified,
    questions,
    trainStations,
    useLegacyDataSources,
} from "@/lib/context";
import { memoizeAsync } from "@/lib/memoizeAsync";
import {
    fetchCoastline,
    fetchElevationRegions,
    fetchGeodataFeatures,
    fetchMotorways,
    findAdminBoundary,
    findPlacesInZone,
    findPlacesSpecificInZone,
    LOCATION_FIRST_TAG,
    nearestToQuestion,
    prettifyLocation,
    QuestionSpecificLocation,
    tryFetchGeodataFeatures,
} from "@/maps/api";
import {
    arcBufferToPoint,
    arcDistance,
    connectToSeparateLines,
    groupObjects,
    holedMask,
    modifyMapData,
} from "@/maps/geo-utils";
import {
    bufferPois,
    clipMap,
    filterPois,
} from "@/maps/geo-utils/geometryWorker";
import type {
    APILocations,
    HomeGameMeasuringQuestions,
    MeasuringQuestion,
} from "@/maps/schema";
import { motorwaySnapshotSchema } from "@/maps/schema";

export const prepareMotorwayQuestion = async (
    question: MeasuringQuestion,
    remainingArea: FeatureCollection,
    questionKey?: number,
) => {
    if (question.type !== "motorway" || question.motorway) return question;
    const bbox = turf.bbox(remainingArea);
    const data = await fetchMotorways(bbox);
    if (data.complete !== true || !data.features?.length)
        throw new Error("No motorway selection is available for this area.");
    const current =
        questionKey === undefined
            ? undefined
            : questions
                  .get()
                  .find(
                      (entry) =>
                          entry.key === questionKey && entry.id === "measuring",
                  );
    const currentData = current?.id === "measuring" ? current.data : question;
    question.motorway =
        currentData.motorway ?? motorwaySnapshotSchema.parse({ ...data, bbox });
    currentData.motorway = question.motorway;
    // Save the roads themselves so dataset updates cannot change an answer.
    questionModified();
    return currentData;
};

export interface AdminZoneInfo {
    name: string;
    boundary: any;
}

export const findAdminZoneInfo = _.memoize(
    async (
        lat: number,
        lng: number,
        adminLevel: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
    ): Promise<AdminZoneInfo | null> => {
        const boundary = await findAdminBoundary(lat, lng, adminLevel);

        if (!boundary) {
            return null;
        }

        const name =
            boundary.properties?.["name:en"] ??
            boundary.properties?.name ??
            "Unknown";

        return { name, boundary };
    },
    (lat, lng, adminLevel) =>
        `${lat.toFixed(6)},${lng.toFixed(6)},${adminLevel}`,
);

const highSpeedBase = _.memoize(
    (features: Feature[]) => {
        const grouped = groupObjects(features);

        const neighbored = grouped
            .map((group) => {
                return turf.multiLineString(
                    connectToSeparateLines(
                        group
                            .filter((x) => turf.getType(x) === "LineString")
                            .map((x) => x.geometry.coordinates),
                    ),
                );
            })
            .filter((x) => x.geometry.coordinates.length > 0);

        return turf.combine(
            turf.buffer(
                turf.simplify(turf.featureCollection(neighbored), {
                    tolerance: 0.001,
                }),
                0.001,
            )!,
        ).features[0];
    },
    (features) => `${JSON.stringify(features.map((x) => x.geometry))}`,
);

const bboxExtension = (
    bBox: [number, number, number, number],
    distance: number,
): [number, number, number, number] => {
    const buffered = turf.bbox(
        turf.buffer(turf.bboxPolygon(bBox), Math.abs(distance), {
            units: "miles",
        })!,
    );

    const originalDeltaLat = bBox[3] - bBox[1];
    const originalDeltaLng = bBox[2] - bBox[0];

    return [
        buffered[0] - originalDeltaLng,
        buffered[1] - originalDeltaLat,
        buffered[2] + originalDeltaLng,
        buffered[3] + originalDeltaLat,
    ];
};

export const determineMeasuringBoundary = async (
    question: MeasuringQuestion,
) => {
    const bBox = turf.bbox(mapGeoJSON.get()!);

    switch (question.type) {
        case "highspeed-measure-shinkansen": {
            if (!useLegacyDataSources.get()) {
                const rail = await tryFetchGeodataFeatures(
                    question.type,
                    bBox,
                    question.lat,
                    question.lng,
                );
                if (rail?.features.length) return rail.features;
            }

            const features = osmtogeojson(
                await findPlacesInZone(
                    "[highspeed=yes]",
                    "Finding high-speed lines...",
                    "nwr",
                    "geom",
                ),
            ).features;

            return [highSpeedBase(features)];
        }
        case "admin-measure": {
            const adminLevel = (question as any).cat?.adminLevel ?? 4;
            const zoneInfo = await findAdminZoneInfo(
                question.lat,
                question.lng,
                adminLevel,
            );

            if (!zoneInfo) {
                toast.error("No admin boundary found at this location");
                return [turf.multiPolygon([])];
            }

            // Store the zone name for display
            if (!(question as any).cat) {
                (question as any).cat = { adminLevel };
            }
            (question as any).cat.zoneName = zoneInfo.name;

            // Convert the polygon to its outline (the border)
            const outline = turf.polygonToLine(zoneInfo.boundary);
            return [outline];
        }
        case "motorway": {
            await prepareMotorwayQuestion(question, mapGeoJSON.get()!);
            return question.motorway!.features;
        }
        case "body-of-water": {
            const data = await fetchGeodataFeatures(
                question.type,
                bBox,
                question.lat,
                question.lng,
            );
            if (!data.features.length)
                throw new Error("No matching features found in this area.");
            return data.features;
        }
        case "coastline": {
            const coastline = turf.lineToPolygon(
                await fetchCoastline(),
            ) as Feature<MultiPolygon>;

            const distanceToCoastline = turf.pointToPolygonDistance(
                turf.point([question.lng, question.lat]),
                coastline,
                {
                    units: "miles",
                    method: "geodesic",
                },
            );

            return [
                turf.difference(
                    turf.featureCollection([
                        turf.bboxPolygon(bBox),
                        turf.buffer(
                            turf.bboxClip(
                                coastline,
                                bBox
                                    ? bboxExtension(
                                          bBox as any,
                                          distanceToCoastline,
                                      )
                                    : [-180, -90, 180, 90],
                            ),
                            distanceToCoastline,
                            {
                                units: "miles",
                                steps: 64,
                            },
                        )!,
                    ]),
                )!,
            ];
        }
        case "airport":
            return [
                turf.combine(
                    turf.featureCollection(
                        _.uniqBy(
                            (
                                await findPlacesInZone(
                                    '["aeroway"="aerodrome"]["iata"]', // Only commercial airports have IATA codes,
                                    "Finding airports...",
                                )
                            ).elements,
                            (feature: any) => feature.tags.iata,
                        ).map((x: any) =>
                            turf.point([
                                x.center ? x.center.lon : x.lon,
                                x.center ? x.center.lat : x.lat,
                            ]),
                        ),
                    ),
                ).features[0],
            ];
        case "city":
            return [
                turf.combine(
                    turf.featureCollection(
                        (
                            await findPlacesInZone(
                                '[place=city]["population"~"^[1-9]+[0-9]{6}$"]', // The regex is faster than (if:number(t["population"])>1000000)
                                "Finding cities...",
                            )
                        ).elements.map((x: any) =>
                            turf.point([
                                x.center ? x.center.lon : x.lon,
                                x.center ? x.center.lat : x.lat,
                            ]),
                        ),
                    ),
                ).features[0],
            ];
        case "aquarium-full":
        case "zoo-full":
        case "theme_park-full":
        case "peak-full":
        case "museum-full":
        case "hospital-full":
        case "cinema-full":
        case "library-full":
        case "golf_course-full":
        case "consulate-full":
        case "park-full": {
            const location = question.type.split("-full")[0] as APILocations;

            if (!useLegacyDataSources.get()) {
                const prepared = await tryFetchGeodataFeatures(
                    location,
                    bBox,
                    question.lat,
                    question.lng,
                    mapGeoJSON.get()!,
                );
                if (prepared) {
                    const points = await filterPois(
                        prepared as FeatureCollection<Point>,
                        mapGeoJSON.get()!,
                    );
                    if (!points.features.length)
                        throw new Error(
                            `No ${prettifyLocation(location, true).toLowerCase()} found in this area.`,
                        );
                    return turf.combine(points).features;
                }
            }

            const data = await findPlacesInZone(
                `[${LOCATION_FIRST_TAG[location]}=${location}]`,
                `Finding ${prettifyLocation(location, true).toLowerCase()}...`,
                "nwr",
                "center",
                [],
                60,
            );

            if (data.remark && data.remark.startsWith("runtime error")) {
                toast.error(
                    `Error finding ${prettifyLocation(
                        location,
                        true,
                    ).toLowerCase()}. Please enable hiding zone mode and switch to the Large Game variation of this question.`,
                );
                return [turf.multiPolygon([])];
            }

            if (data.elements.length >= 1000) {
                toast.error(
                    `Too many ${prettifyLocation(
                        location,
                        true,
                    ).toLowerCase()} found (${data.elements.length}). Please enable hiding zone mode and switch to the Large Game variation of this question.`,
                );
                return [turf.multiPolygon([])];
            }

            return [
                turf.combine(
                    turf.featureCollection(
                        data.elements.map((x: any) =>
                            turf.point([
                                x.center ? x.center.lon : x.lon,
                                x.center ? x.center.lat : x.lat,
                            ]),
                        ),
                    ),
                ).features[0],
            ];
        }
        case "custom-measure":
            return turf.combine(
                turf.featureCollection((question as any).geo.features),
            ).features;
        case "aquarium":
        case "zoo":
        case "theme_park":
        case "peak":
        case "museum":
        case "hospital":
        case "cinema":
        case "library":
        case "golf_course":
        case "consulate":
        case "park":
        case "mcdonalds":
        case "seven11":
        case "rail-measure":
            return false;
    }
};

const bufferedDeterminer = memoizeAsync(
    async (question: MeasuringQuestion) => {
        const placeData = await determineMeasuringBoundary(question);

        if (placeData === false || placeData === undefined) return false;

        if (question.type === "motorway" && question.motorway) {
            const point = turf.point([question.lng, question.lat]);
            const lines = question.motorway.features.flatMap(
                (feature) => feature.geometry.coordinates,
            );
            const distance = Math.min(
                ...lines.map((line) =>
                    turf.pointToLineDistance(point, turf.lineString(line), {
                        units: "kilometers",
                    }),
                ),
            );
            // Buffer the joined roads without the slow ArcGIS calculation.
            if (distance === 0) return turf.multiPolygon([]);
            const region = turf.buffer(turf.multiLineString(lines), distance, {
                units: "kilometers",
            });
            if (!region)
                throw new Error("Could not calculate the motorway boundary.");
            return region;
        }

        if (
            typeof Worker !== "undefined" &&
            placeData.some(
                (feature) =>
                    "geometry" in feature &&
                    feature.geometry.type === "MultiPoint" &&
                    feature.geometry.coordinates.length > 1000,
            )
        ) {
            return bufferPois(
                turf.featureCollection(placeData as any),
                question.lat,
                question.lng,
            );
        }
        return arcBufferToPoint(
            turf.featureCollection(placeData as any),
            question.lat,
            question.lng,
        );
    },
    (question) =>
        JSON.stringify({
            type: question.type,
            lat: question.lat,
            lng: question.lng,
            entirety: polyGeoJSON.get()
                ? polyGeoJSON.get()
                : mapGeoLocation.get(),
            geo: (question as any).geo,
            cat: (question as any).cat,
            legacy: useLegacyDataSources.get(),
            motorway: question.motorway,
        }),
);

const elevationRegion = memoizeAsync(
    (question: MeasuringQuestion) =>
        fetchElevationRegions(
            turf.bbox(mapGeoJSON.get()!),
            question.lat,
            question.lng,
        ),
    (question) =>
        JSON.stringify([
            question.lat,
            question.lng,
            turf.bbox(mapGeoJSON.get()!),
        ]),
);

export const adjustPerMeasuring = async (
    question: MeasuringQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    if (question.type === "elevation") {
        const regions = await elevationRegion(question);
        const region = question.hiderCloser ? regions.higher : regions.lower;
        return region ? modifyMapData(mapData, region, true) : null;
    }

    const buffer = await bufferedDeterminer(question);

    if (buffer === false) return mapData;

    if (typeof Worker !== "undefined" && turf.coordAll(buffer).length > 10000) {
        return clipMap(mapData, buffer, question.hiderCloser);
    }
    return modifyMapData(mapData, buffer, question.hiderCloser);
};

export const hiderifyMeasuring = async (question: MeasuringQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    if (question.type === "motorway") {
        const region = await bufferedDeterminer(question);
        if (!region)
            throw new Error("Could not calculate the motorway answer.");
        const hiderCloser = turf.booleanPointInPolygon(
            turf.point([$hiderMode.longitude, $hiderMode.latitude]),
            region,
        );
        if (question.hiderCloser !== hiderCloser) {
            question.hiderCloser = hiderCloser;
            questionModified();
        }
        return question;
    }

    if (question.type === "elevation") {
        const { higher, lower } = await elevationRegion(question);
        const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);
        const isHigher = !!higher && turf.booleanPointInPolygon(hider, higher);
        if (!isHigher && !(lower && turf.booleanPointInPolygon(hider, lower))) {
            throw new Error("No elevation data at the hiding location.");
        }
        question.hiderCloser = isHigher;
        return question;
    }

    if (
        [
            "aquarium",
            "zoo",
            "theme_park",
            "peak",
            "museum",
            "hospital",
            "cinema",
            "library",
            "golf_course",
            "consulate",
            "park",
        ].includes(question.type)
    ) {
        const questionNearest = await nearestToQuestion(
            question as HomeGameMeasuringQuestions,
        );
        const hiderNearest = await nearestToQuestion({
            lat: $hiderMode.latitude,
            lng: $hiderMode.longitude,
            hiderCloser: true,
            type: (question as HomeGameMeasuringQuestions).type,
            drag: false,
            color: "black",
            collapsed: false,
        });

        question.hiderCloser =
            questionNearest.properties.distanceToPoint >
            hiderNearest.properties.distanceToPoint;

        return question;
    }

    if (question.type === "rail-measure") {
        const stations = trainStations.get();

        if (stations.length === 0) {
            return question;
        }

        const location = turf.point([question.lng, question.lat]);

        const nearestTrainStation = turf.nearestPoint(
            location,
            turf.featureCollection(stations.map((x) => x.properties)),
        );

        const distance = await arcDistance(location, nearestTrainStation);

        const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

        const hiderNearest = turf.nearestPoint(
            hider,
            turf.featureCollection(stations.map((x) => x.properties)),
        );

        const hiderDistance = await arcDistance(hider, hiderNearest);

        question.hiderCloser = hiderDistance < distance;
    }

    if (question.type === "mcdonalds" || question.type === "seven11") {
        const points = await findPlacesSpecificInZone(
            question.type === "mcdonalds"
                ? QuestionSpecificLocation.McDonalds
                : QuestionSpecificLocation.Seven11,
        );

        const seeker = turf.point([question.lng, question.lat]);
        const nearest = turf.nearestPoint(seeker, points as any);

        const distance = await arcDistance(seeker, nearest, "miles");

        const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);
        const hiderNearest = turf.nearestPoint(hider, points as any);

        const hiderDistance = await arcDistance(hider, hiderNearest, "miles");

        question.hiderCloser = hiderDistance < distance;
        return question;
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    let feature = null;

    try {
        feature = holedMask((await adjustPerMeasuring(question, $mapGeoJSON))!);
    } catch {
        try {
            feature = await adjustPerMeasuring(question, {
                type: "FeatureCollection",
                features: [holedMask($mapGeoJSON)],
            });
        } catch {
            return question;
        }
    }

    if (feature === null || feature === undefined) return question;

    const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

    if (turf.booleanPointInPolygon(hiderPoint, feature)) {
        question.hiderCloser = !question.hiderCloser;
    }

    return question;
};

export const measuringPlanningPolygon = async (question: MeasuringQuestion) => {
    const buffered =
        question.type === "elevation"
            ? (await elevationRegion(question)).higher
            : await bufferedDeterminer(question);

    if (!buffered) return false;

    return turf.polygonToLine(buffered);
};
