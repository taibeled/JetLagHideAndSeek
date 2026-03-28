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

const determineNodeDegrees = (lines: TraceLine[], tracingClass: TraceClass) => {
    const degree = new Map<string, number>();
    const relevantLines =
        tracingClass === "road"
            ? lines.filter((line) => line.traceClass === "road")
            : lines;

    for (const line of relevantLines) {
        for (let i = 0; i < line.coordinates.length - 1; i++) {
            const a = roundedCoordKey(line.coordinates[i]);
            const b = roundedCoordKey(line.coordinates[i + 1]);

            degree.set(a, (degree.get(a) ?? 0) + 1);
            degree.set(b, (degree.get(b) ?? 0) + 1);
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

    let bestLine: TraceLine | null = null;
    let bestSegmentIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const line of lines) {
        const nearest = turf.nearestPointOnLine(
            turf.lineString(line.coordinates),
            origin,
            {
                units: "meters",
            },
        );

        const distance = nearest.properties.dist;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestLine = line;
            bestSegmentIndex = nearest.properties.index ?? 0;
        }
    }

    if (!bestLine) {
        return [];
    }

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

    if (!graph.adjacency.has(startNodeA) || !graph.adjacency.has(startNodeB)) {
        return traceBetweenIntersections(
            bestLine.coordinates,
            bestSegmentIndex,
            nodeDegrees,
        );
    }

    const tracedCoordinates = traceAcrossGraph(
        startNodeA,
        startNodeB,
        nodeDegrees,
        graph,
    );

    if (tracedCoordinates.length < 2) {
        return traceBetweenIntersections(
            bestLine.coordinates,
            bestSegmentIndex,
            nodeDegrees,
        );
    }

    return tracedCoordinates;
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
        return question;
    }

    question.trace = (
        await determineStreetTrace($hiderMode.latitude, $hiderMode.longitude)
    ).map((coord) => [coord[0], coord[1]]);
    question.source = "hider";
    question.drag = false;

    return question;
};

export const hiderifyStreetTrace = async (question: StreetTraceQuestion) => {
    return refreshStreetTrace(question);
};
