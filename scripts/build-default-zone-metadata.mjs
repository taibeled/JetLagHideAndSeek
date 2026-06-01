import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokyoBoundaryPath = join(root, "assets/default-zones/tokyo.json");
const tokyoMetadataPath = join(
    root,
    "assets/default-zones/tokyo-metadata.json",
);

const boundary = JSON.parse(await readFile(tokyoBoundaryPath, "utf8"));
const metadata = buildMetadata(boundary);
const serialized = await format(JSON.stringify(metadata), {
    parser: "json",
    tabWidth: 4,
});

if (process.argv.includes("--check")) {
    const existing = await readFile(tokyoMetadataPath, "utf8");
    if (existing !== serialized) {
        throw new Error(
            "Tokyo default-zone metadata is stale. Run pnpm data:default-zones.",
        );
    }
} else {
    await writeFile(tokyoMetadataPath, serialized);
}

function buildMetadata(featureCollection) {
    const bbox = calculateBbox(featureCollection);
    return {
        bbox,
        center: calculateCenter(bbox),
        maskHoles: getMaskHoles(featureCollection),
    };
}

function calculateBbox(featureCollection) {
    const positions = [];
    for (const feature of featureCollection.features) {
        collectPositions(feature.geometry.coordinates, positions);
    }
    if (positions.length === 0) {
        throw new Error("Cannot calculate metadata for an empty boundary.");
    }

    return positions.reduce(
        ([west, south, east, north], [lng, lat]) => [
            Math.min(west, lng),
            Math.min(south, lat),
            Math.max(east, lng),
            Math.max(north, lat),
        ],
        [Infinity, Infinity, -Infinity, -Infinity],
    );
}

function calculateCenter([west, south, east, north]) {
    return [(west + east) / 2, (south + north) / 2];
}

function collectPositions(value, output) {
    if (!Array.isArray(value)) return;
    if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
    ) {
        output.push([value[0], value[1]]);
        return;
    }
    for (const child of value) {
        collectPositions(child, output);
    }
}

function getMaskHoles(featureCollection) {
    return featureCollection.features.flatMap((feature, featureIndex) => {
        if (feature.geometry.type === "Polygon") {
            return [
                makeMaskHole(
                    feature.geometry.coordinates[0],
                    featureIndex,
                    null,
                ),
            ];
        }
        if (feature.geometry.type === "MultiPolygon") {
            return feature.geometry.coordinates.map((polygon, polygonIndex) =>
                makeMaskHole(polygon[0], featureIndex, polygonIndex),
            );
        }
        return [];
    });
}

function makeMaskHole(ring, featureIndex, polygonIndex) {
    return {
        featureIndex,
        polygonIndex,
        reverse: signedRingArea(ring) > 0,
    };
}

function signedRingArea(ring) {
    let area = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
        const [x1, y1] = ring[index];
        const [x2, y2] = ring[index + 1];
        area += x1 * y2 - x2 * y1;
    }
    return area / 2;
}
