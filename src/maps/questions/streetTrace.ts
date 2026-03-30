import * as turf from "@turf/turf";
import * as _ from "lodash";

import { hiderMode } from "@/lib/context";
import { findNearbyStreetNetwork } from "@/maps/api";
import type { StreetTraceQuestion } from "@/maps/schema";

type TraceClass = "road" | "path";

type TraceLine = {
    coordinates: number[][];
    traceClass: TraceClass;
};

type GraphBundle = {
    adjacency: Map<string, Set<string>>;
    coordinatesByNode: Map<string, number[]>;
};

const MIN_TRACE_LENGTH_KM = 0.1;
const LOCAL_TRACE_SEARCH_RADIUS_METERS = 15;
const ROAD_PRIORITY_RADIUS_METERS = 15;

const roundedCoordKey = (coordinate: number[]) =>
    `${coordinate[0].toFixed(7)},${coordinate[1].toFixed(7)}`;

const PATH_HIGHWAYS = new Set([
    "path",
    "footway",
    "cycleway",
    "bridleway",
    "steps",
    "pedestrian",
]);

const classifyHighway = (highwayRaw: unknown): TraceClass => {
    const highway = Array.isArray(highwayRaw)
        ? highwayRaw[0]
        : typeof highwayRaw === "string"
          ? highwayRaw
          : "";

    if (PATH_HIGHWAYS.has(highway)) {
        return "path";
    }

    return "road";
};

const flattenLineCoordinates = (features: any[]) => {
    const lines: TraceLine[] = [];

    for (const feature of features) {
        if (!feature?.geometry) continue;

        const traceClass = classifyHighway(feature?.properties?.tags?.highway);

        if (feature.geometry.type === "LineString") {
            lines.push({
                coordinates: feature.geometry.coordinates,
                traceClass,
            });
            continue;
        }

        if (feature.geometry.type === "MultiLineString") {
            lines.push(
                ...feature.geometry.coordinates.map((coordinates: number[][]) => ({
                    coordinates,
                    traceClass,
                })),
            );
        }
    }

    return lines.filter((line) => line.coordinates.length >= 2);
};

const collectNodeKeys = (lines: TraceLine[]) => {
    const nodes = new Set<string>();

    for (const line of lines) {
        for (const coordinate of line.coordinates) {
            nodes.add(roundedCoordKey(coordinate));
        }
    }

    return nodes;
};

const determineNodeDegrees = (lines: TraceLine[], tracingClass: TraceClass) => {
    const degree = new Map<string, number>();
    const traversalLines = lines.filter(
        (line) => line.traceClass === tracingClass,
    );

    for (const line of traversalLines) {
        for (let i = 0; i < line.coordinates.length - 1; i++) {
            const a = roundedCoordKey(line.coordinates[i]);
            const b = roundedCoordKey(line.coordinates[i + 1]);

            degree.set(a, (degree.get(a) ?? 0) + 1);
            degree.set(b, (degree.get(b) ?? 0) + 1);
        }
    }

    // Path traces should stop when they meet roads, while road traces should
    // ignore path junctions and only react to road-road intersections.
    if (tracingClass === "path") {
        const roadNodes = collectNodeKeys(
            lines.filter((line) => line.traceClass === "road"),
        );

        for (const node of degree.keys()) {
            if (roadNodes.has(node)) {
                degree.set(node, (degree.get(node) ?? 0) + 1);
            }
        }
    }

    return degree;
};

const buildGraph = (lines: TraceLine[], tracingClass: TraceClass): GraphBundle => {
    const adjacency = new Map<string, Set<string>>();
    const coordinatesByNode = new Map<string, number[]>();

    const traversalLines = lines.filter(
        (line) => line.traceClass === tracingClass,
    );

    for (const line of traversalLines) {
        for (let i = 0; i < line.coordinates.length - 1; i++) {
            const aCoord = line.coordinates[i];
            const bCoord = line.coordinates[i + 1];
            const a = roundedCoordKey(aCoord);
            const b = roundedCoordKey(bCoord);

            if (!coordinatesByNode.has(a)) {
                coordinatesByNode.set(a, aCoord);
            }
            if (!coordinatesByNode.has(b)) {
                coordinatesByNode.set(b, bCoord);
            }

            if (!adjacency.has(a)) adjacency.set(a, new Set<string>());
            if (!adjacency.has(b)) adjacency.set(b, new Set<string>());

            adjacency.get(a)!.add(b);
            adjacency.get(b)!.add(a);
        }
    }

    return { adjacency, coordinatesByNode };
};

const walkUntilIntersection = (
    startNode: string,
    previousNode: string,
    intersectionDegreeMap: Map<string, number>,
    graph: GraphBundle,
) => {
    const walkedNodes = [startNode];
    let currentNode = startNode;
    let priorNode = previousNode;

    while ((intersectionDegreeMap.get(currentNode) ?? 0) === 2) {
        const neighbors = Array.from(graph.adjacency.get(currentNode) ?? []);
        const nextCandidates = neighbors.filter((neighbor) => neighbor !== priorNode);

        if (nextCandidates.length === 0) {
            break;
        }

        const nextNode = nextCandidates[0];
        walkedNodes.push(nextNode);
        priorNode = currentNode;
        currentNode = nextNode;
    }

    return walkedNodes;
};

const traceAcrossGraph = (
    startNodeA: string,
    startNodeB: string,
    intersectionDegreeMap: Map<string, number>,
    graph: GraphBundle,
) => {
    const leftWalk = walkUntilIntersection(
        startNodeA,
        startNodeB,
        intersectionDegreeMap,
        graph,
    );
    const rightWalk = walkUntilIntersection(
        startNodeB,
        startNodeA,
        intersectionDegreeMap,
        graph,
    );

    const stitchedNodes = [...leftWalk.reverse(), ...rightWalk];

    return stitchedNodes
        .map((node) => graph.coordinatesByNode.get(node))
        .filter((coord): coord is number[] => Array.isArray(coord));
};

const traceBetweenIntersections = (
    lineCoordinates: number[][],
    nearestSegmentIndex: number,
    nodeDegreeMap: Map<string, number>,
) => {
    if (lineCoordinates.length < 2) {
        return [];
    }

    const segmentStartIndex = Math.max(
        0,
        Math.min(nearestSegmentIndex, lineCoordinates.length - 2),
    );

    let left = segmentStartIndex;
    let right = segmentStartIndex + 1;

    while (
        left > 0 &&
        (nodeDegreeMap.get(roundedCoordKey(lineCoordinates[left])) ?? 0) === 2
    ) {
        left -= 1;
    }

    while (
        right < lineCoordinates.length - 1 &&
        (nodeDegreeMap.get(roundedCoordKey(lineCoordinates[right])) ?? 0) === 2
    ) {
        right += 1;
    }

    return lineCoordinates.slice(left, right + 1);
};

const traceLengthKm = (trace: number[][]) => {
    if (trace.length < 2) {
        return 0;
    }

    return turf.length(
        turf.lineString(trace as [number, number][]),
        {
            units: "kilometers",
        },
    );
};

const analyzeTrace = (trace: number[][]) => {
    const lengthKm = traceLengthKm(trace);

    return {
        lengthKm,
    };
};

const walkToNextIntersection = (
    startNode: string,
    previousNode: string,
    nodeDegrees: Map<string, number>,
    graph: GraphBundle,
) => {
    const walkedNodes: string[] = [];
    let currentNode = startNode;
    let priorNode = previousNode;

    while (true) {
        walkedNodes.push(currentNode);

        if ((nodeDegrees.get(currentNode) ?? 0) !== 2) {
            break;
        }

        const neighbors = Array.from(graph.adjacency.get(currentNode) ?? []);
        const nextCandidates = neighbors.filter((neighbor) => neighbor !== priorNode);

        if (nextCandidates.length === 0) {
            break;
        }

        const nextNode = nextCandidates[0];
        priorNode = currentNode;
        currentNode = nextNode;
    }

    return walkedNodes;
};

const extendRoadTracePastIntersection = (
    trace: number[][],
    nodeDegrees: Map<string, number>,
    graph: GraphBundle,
    minimumLengthKm: number,
) => {
    if (trace.length < 2) {
        return trace;
    }

    let traceNodes = trace.map(roundedCoordKey);
    const maxExtensions = 4;

    const tryExtend = (fromStart: boolean) => {
        if (traceNodes.length < 2) {
            return false;
        }

        const endpoint = fromStart ? traceNodes[0] : traceNodes[traceNodes.length - 1];
        const insideNeighbor = fromStart ? traceNodes[1] : traceNodes[traceNodes.length - 2];
        const neighbors = Array.from(graph.adjacency.get(endpoint) ?? []);
        const outgoingCandidates = neighbors.filter(
            (neighbor) => neighbor !== insideNeighbor && !traceNodes.includes(neighbor),
        );

        if (outgoingCandidates.length === 0) {
            return false;
        }

        const nextNode = outgoingCandidates[0];
        const extensionNodes = walkToNextIntersection(
            nextNode,
            endpoint,
            nodeDegrees,
            graph,
        );

        if (extensionNodes.length === 0) {
            return false;
        }

        if (fromStart) {
            traceNodes = [...extensionNodes.reverse(), ...traceNodes];
        } else {
            traceNodes = [...traceNodes, ...extensionNodes];
        }

        return true;
    };

    let extensionCount = 0;
    while (traceLengthKm(traceNodes.map((node) => graph.coordinatesByNode.get(node)!)) < minimumLengthKm) {
        if (extensionCount >= maxExtensions) {
            break;
        }

        const startExtended = tryExtend(true);
        extensionCount += startExtended ? 1 : 0;

        if (traceLengthKm(traceNodes.map((node) => graph.coordinatesByNode.get(node)!)) >= minimumLengthKm) {
            break;
        }

        const endExtended = tryExtend(false);
        extensionCount += endExtended ? 1 : 0;

        if (!startExtended && !endExtended) {
            break;
        }
    }

    return traceNodes
        .map((node) => graph.coordinatesByNode.get(node))
        .filter((coord): coord is number[] => Array.isArray(coord));
};

const findNearbyLongerTrace = (
    lines: TraceLine[],
    origin: turf.helpers.Point,
    tracingClass: TraceClass,
    nodeDegrees: Map<string, number>,
    bestTraceLengthKm: number,
) => {
    let bestTrace: number[][] = [];
    let bestDistanceMeters = Number.POSITIVE_INFINITY;
    let bestLengthKm = bestTraceLengthKm;

    for (const line of lines) {
        if (line.traceClass !== tracingClass || line.coordinates.length < 2) {
            continue;
        }

        const nearest = turf.nearestPointOnLine(
            turf.lineString(line.coordinates),
            origin,
            {
                units: "meters",
            },
        );

        const distanceMeters = nearest.properties.dist ?? Number.POSITIVE_INFINITY;

        // Keep the search local so we do not jump to unrelated nearby roads.
        if (distanceMeters > LOCAL_TRACE_SEARCH_RADIUS_METERS) {
            continue;
        }

        const segmentIndex = Math.max(
            0,
            Math.min(nearest.properties.index ?? 0, line.coordinates.length - 2),
        );

        const candidateTrace = traceBetweenIntersections(
            line.coordinates,
            segmentIndex,
            nodeDegrees,
        );
        const candidateAnalysis = analyzeTrace(candidateTrace);
        const candidateLengthKm = candidateAnalysis.lengthKm;

        if (
            candidateLengthKm > bestLengthKm ||
            (candidateLengthKm === bestLengthKm &&
                distanceMeters < bestDistanceMeters)
        ) {
            bestTrace = candidateTrace;
            bestLengthKm = candidateLengthKm;
            bestDistanceMeters = distanceMeters;
        }
    }

    return bestTrace;
};

const determineStreetTraceInternal = async (
    latitude: number,
    longitude: number,
): Promise<number[][]> => {
    const network = await findNearbyStreetNetwork(latitude, longitude);
    const lines = flattenLineCoordinates(network.features);

    if (lines.length === 0) {
        return [];
    }

    const origin = turf.point([longitude, latitude]);

    const findNearestLine = (candidates: TraceLine[]) => {
        let nearestLine: TraceLine | null = null;
        let nearestSegmentIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const line of candidates) {
            const nearest = turf.nearestPointOnLine(
                turf.lineString(line.coordinates),
                origin,
                {
                    units: "meters",
                },
            );

            const distance = nearest.properties.dist;
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestLine = line;
                nearestSegmentIndex = nearest.properties.index ?? 0;
            }
        }

        return {
            line: nearestLine,
            segmentIndex: nearestSegmentIndex,
            distance: nearestDistance,
        };
    };

    const roadCandidates = lines.filter((line) => line.traceClass === "road");
    const pathCandidates = lines.filter((line) => line.traceClass === "path");

    const nearestRoad = findNearestLine(roadCandidates);
    const nearestPath = findNearestLine(pathCandidates);

    const buildTraceForCandidate = (
        bestLine: TraceLine,
        bestSegmentIndex: number,
    ) => {
        const segmentStartIndex = Math.max(
            0,
            Math.min(bestSegmentIndex, bestLine.coordinates.length - 2),
        );

        const startCoordA = bestLine.coordinates[segmentStartIndex];
        const startCoordB = bestLine.coordinates[segmentStartIndex + 1];

        const startNodeA = roundedCoordKey(startCoordA);
        const startNodeB = roundedCoordKey(startCoordB);

        const nodeDegrees = determineNodeDegrees(lines, bestLine.traceClass);
        const graph = buildGraph(lines, bestLine.traceClass);

        const ensureMinimumTrace = (baseTrace: number[][]) => {
            let chosenTrace = baseTrace;
            let chosenTraceAnalysis = analyzeTrace(baseTrace);

            if (
                bestLine.traceClass === "road" &&
                chosenTraceAnalysis.lengthKm < MIN_TRACE_LENGTH_KM
            ) {
                const extendedTrace = extendRoadTracePastIntersection(
                    chosenTrace,
                    nodeDegrees,
                    graph,
                    MIN_TRACE_LENGTH_KM,
                );
                const extendedTraceAnalysis = analyzeTrace(extendedTrace);

                if (extendedTraceAnalysis.lengthKm > chosenTraceAnalysis.lengthKm) {
                    chosenTrace = extendedTrace;
                    chosenTraceAnalysis = extendedTraceAnalysis;
                }
            }

            if (
                chosenTraceAnalysis.lengthKm < MIN_TRACE_LENGTH_KM
            ) {
                const nearbyLongerTrace = findNearbyLongerTrace(
                    lines,
                    origin,
                    bestLine.traceClass,
                    nodeDegrees,
                    chosenTraceAnalysis.lengthKm,
                );
                const nearbyLongerTraceAnalysis = analyzeTrace(nearbyLongerTrace);

                if (
                    nearbyLongerTraceAnalysis.lengthKm >
                    chosenTraceAnalysis.lengthKm
                ) {
                    chosenTrace = nearbyLongerTrace;
                    chosenTraceAnalysis = nearbyLongerTraceAnalysis;
                }
            }

            if (chosenTraceAnalysis.lengthKm < MIN_TRACE_LENGTH_KM) {
                return [];
            }

            return chosenTrace;
        };

        if (!graph.adjacency.has(startNodeA) || !graph.adjacency.has(startNodeB)) {
            const traceOnBestLine = traceBetweenIntersections(
                bestLine.coordinates,
                bestSegmentIndex,
                nodeDegrees,
            );
            return ensureMinimumTrace(traceOnBestLine);
        }

        const tracedCoordinates = traceAcrossGraph(
            startNodeA,
            startNodeB,
            nodeDegrees,
            graph,
        );

        const lineBetweenIntersections = traceBetweenIntersections(
            bestLine.coordinates,
            bestSegmentIndex,
            nodeDegrees,
        );

        const tracedCoordinatesLengthKm = traceLengthKm(tracedCoordinates);
        const lineBetweenIntersectionsLengthKm = traceLengthKm(lineBetweenIntersections);

        const preferredTrace =
            tracedCoordinatesLengthKm >= lineBetweenIntersectionsLengthKm
                ? tracedCoordinates
                : lineBetweenIntersections;

        return ensureMinimumTrace(preferredTrace);
    };

    const candidateOrder: Array<{ line: TraceLine; segmentIndex: number }> = [];
    const hasNearbyRoad =
        nearestRoad.line !== null &&
        nearestRoad.distance <= ROAD_PRIORITY_RADIUS_METERS;

    if (hasNearbyRoad && nearestRoad.line) {
        candidateOrder.push({
            line: nearestRoad.line,
            segmentIndex: nearestRoad.segmentIndex,
        });
    } else if (nearestPath.line) {
        candidateOrder.push({
            line: nearestPath.line,
            segmentIndex: nearestPath.segmentIndex,
        });
    }

    for (const candidate of candidateOrder) {
        const candidateTrace = buildTraceForCandidate(
            candidate.line,
            candidate.segmentIndex,
        );
        if (candidateTrace.length >= 2) {
            return candidateTrace;
        }
    }

    return [];
};

const determineStreetTrace = _.memoize(
    determineStreetTraceInternal,
    (latitude: number, longitude: number) =>
        `${latitude.toFixed(5)},${longitude.toFixed(5)}`,
);

export const adjustPerStreetTrace = async (
    _question: StreetTraceQuestion,
    mapData: any,
) => mapData;

export const refreshStreetTrace = async (question: StreetTraceQuestion) => {
    const $hiderMode = hiderMode.get();

    if ($hiderMode === false) {
        question.trace = [];
        question.source = "question";
        question.debug = {
            source: "question",
            tracePointCount: 0,
            traceLengthKm: 0,
            note: "Hider mode disabled",
        };
        return question;
    }

    question.trace = (
        await determineStreetTrace($hiderMode.latitude, $hiderMode.longitude)
    ).map((coord) => [coord[0], coord[1]]);
    question.source = "hider";
    question.drag = false;

    const traceLengthKm =
        question.trace.length >= 2
            ? turf.length(
                  turf.lineString(
                      question.trace.map(
                          (coord) => [coord[0], coord[1]] as [number, number],
                      ),
                  ),
                  {
                  units: "kilometers",
                  },
              )
            : 0;

    question.debug = {
        source: question.source,
        tracePointCount: question.trace.length,
        traceLengthKm: Number(traceLengthKm.toFixed(3)),
    };

    return question;
};

export const hiderifyStreetTrace = async (question: StreetTraceQuestion) => {
    return refreshStreetTrace(question);
};
