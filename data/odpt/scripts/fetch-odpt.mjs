/* global console, fetch, process */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { unzipSync, strFromU8 } from "fflate";
import YAML from "yaml";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const odptDir = resolve(scriptDir, "..");
const configPath = resolve(odptDir, "config.yaml");
const attribution = {
    notice: "See mobile_v2/data/odpt/NOTICE.md for attribution, license, and usage-rule notes.",
    suggestedText:
        "Contains public transportation data made available by the Public Transportation Open Data Center / Association for Open Data of Public Transportation, including data provided by Tokyo Metro Co., Ltd. and the Tokyo Metropolitan Bureau of Transportation. The data has been processed for use in Jet Lag Hide and Seek.",
    sources: [
        {
            provider: "Tokyo Metro Co., Ltd.",
            presetId: "tokyo-metro",
        },
        {
            provider: "Tokyo Metropolitan Bureau of Transportation",
            presetId: "toei-subway",
        },
    ],
};

async function main() {
    const env = await loadEnv();
    const cacheOnly = process.argv.includes("--cache-only");
    const config = YAML.parse(await readFile(configPath, "utf8"));
    const cacheDir = resolve(odptDir, config.cacheDir ?? "cache");
    await mkdir(cacheDir, { recursive: true });

    const presets = [];
    for (const source of config.presets) {
        const url = applyEnv(source.url, env);
        if (source.requiresKey && !env.ODPT_KEY) {
            throw new Error(
                `${source.id} requires ODPT_KEY in the environment or ~/.env.`,
            );
        }

        const zipPath = resolve(cacheDir, `${source.id}.zip`);
        const zipBytes = cacheOnly
            ? await readFile(zipPath)
            : await download(url);
        if (!cacheOnly) {
            await writeFile(zipPath, zipBytes);
        }
        presets.push(processGtfsZip(source, zipBytes));
    }

    const outputPath = resolve(odptDir, config.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
        outputPath,
        `${JSON.stringify(
            {
                attribution,
                generatedAt: new Date().toISOString(),
                presets,
            },
            null,
            2,
        )}\n`,
    );
    console.log(`Wrote ${outputPath}`);
}

async function loadEnv() {
    const env = { ...process.env };
    const homeEnv = resolve(process.env.HOME ?? "", ".env");
    if (!existsSync(homeEnv)) return env;

    const text = await readFile(homeEnv, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (env[key]) continue;
        env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function applyEnv(value, env) {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => {
        return encodeURIComponent(env[key] ?? "");
    });
}

async function download(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

export function processGtfsZip(source, zipBytes) {
    const files = unzipSync(zipBytes);
    const tables = {
        routes: readGtfsTable(files, "routes.txt"),
        shapes: readGtfsTable(files, "shapes.txt"),
        stops: readGtfsTable(files, "stops.txt"),
        stopTimes: readGtfsTable(files, "stop_times.txt"),
        trips: readGtfsTable(files, "trips.txt"),
    };
    return processGtfsTables(source, tables);
}

export function processGtfsTables(source, tables) {
    const tripsById = new Map();
    const routeIds = new Set();
    for (const trip of tables.trips) {
        if (!trip.trip_id || !trip.route_id) continue;
        tripsById.set(trip.trip_id, trip);
        routeIds.add(trip.route_id);
    }

    const routesById = new Map();
    for (const route of tables.routes) {
        if (route.route_id && routeIds.has(route.route_id)) {
            routesById.set(route.route_id, route);
        }
    }

    const stopsById = new Map();
    for (const stop of tables.stops) {
        if (!stop.stop_id || !stop.stop_lat || !stop.stop_lon) continue;
        stopsById.set(stop.stop_id, stop);
    }

    const routeStopIds = new Map();
    const stopTimesByTripId = new Map();
    for (const stopTime of tables.stopTimes) {
        const trip = tripsById.get(stopTime.trip_id);
        if (!trip || !stopTime.stop_id || !stopsById.has(stopTime.stop_id)) {
            continue;
        }
        getArray(stopTimesByTripId, stopTime.trip_id).push({
            sequence: Number(stopTime.stop_sequence ?? 0),
            stopId: stopTime.stop_id,
        });
        getSet(routeStopIds, trip.route_id).add(stopTime.stop_id);
    }

    const shapesById = new Map();
    for (const shape of tables.shapes) {
        if (!shape.shape_id || !shape.shape_pt_lat || !shape.shape_pt_lon) {
            continue;
        }
        const sequence = Number(shape.shape_pt_sequence ?? 0);
        getArray(shapesById, shape.shape_id).push({
            coordinate: [
                Number(shape.shape_pt_lon),
                Number(shape.shape_pt_lat),
            ],
            sequence,
        });
    }

    const shapeIdsByRoute = new Map();
    for (const trip of tripsById.values()) {
        if (!trip.shape_id || !shapesById.has(trip.shape_id)) continue;
        getSet(shapeIdsByRoute, trip.route_id).add(trip.shape_id);
    }

    const stationsByKey = new Map();
    for (const [routeId, stopIds] of routeStopIds.entries()) {
        for (const stopId of stopIds) {
            const stop = stopsById.get(stopId);
            const lng = Number(stop.stop_lon);
            const lat = Number(stop.stop_lat);
            const key = stationKey(stopId, lng, lat);
            const existing = stationsByKey.get(key);
            if (existing) {
                existing.routeIds.push(routeId);
            } else {
                stationsByKey.set(key, {
                    id: key,
                    lat,
                    lon: lng,
                    name: stop.stop_name || stopId,
                    routeIds: [routeId],
                });
            }
        }
    }

    const routes = [];
    for (const [routeId, route] of routesById.entries()) {
        const shapeIds = [...(shapeIdsByRoute.get(routeId) ?? [])];
        const coordinates = shapeIds
            .map((shapeId) =>
                [...shapesById.get(shapeId)]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((point) => point.coordinate),
            )
            .filter((line) => line.length >= 2);
        const routeCoordinates =
            coordinates.length > 0
                ? coordinates
                : buildRouteCoordinatesFromStops(
                      routeId,
                      tripsById,
                      stopTimesByTripId,
                      stopsById,
                  );

        routes.push({
            color: normalizeColor(route.route_color, source.defaultColor),
            geometry: {
                coordinates: routeCoordinates,
                type: "MultiLineString",
            },
            id: routeId,
            name:
                route.route_long_name ||
                route.route_short_name ||
                route.route_desc ||
                routeId,
        });
    }

    const stations = [...stationsByKey.values()].map((station) => ({
        ...station,
        routeIds: [...new Set(station.routeIds)].sort(),
    }));

    const bbox = calculateBbox([
        ...stations.map((station) => [station.lon, station.lat]),
        ...routes.flatMap((route) => route.geometry.coordinates.flat()),
    ]);

    return {
        bbox,
        defaultColor: source.defaultColor,
        id: source.id,
        label: source.label,
        operator: source.operator,
        routes,
        stations,
    };
}

function readGtfsTable(files, name) {
    const fileName = Object.keys(files).find((key) => key.endsWith(name));
    if (!fileName) return [];
    return parseCsv(strFromU8(files[fileName]));
}

export function parseCsv(text) {
    const rows = [];
    let field = "";
    let row = [];
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];
        if (quoted) {
            if (char === '"' && next === '"') {
                field += '"';
                index += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') quoted = true;
        else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else if (char !== "\r") {
            field += char;
        }
    }

    if (field || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    const [headers = [], ...records] = rows;
    return records
        .filter((record) => record.some((value) => value !== ""))
        .map((record) =>
            Object.fromEntries(
                headers.map((header, index) => [header, record[index] ?? ""]),
            ),
        );
}

function buildRouteCoordinatesFromStops(
    routeId,
    tripsById,
    stopTimesByTripId,
    stopsById,
) {
    const linesBySignature = new Map();

    for (const trip of tripsById.values()) {
        if (trip.route_id !== routeId) continue;

        const stopTimes = [...(stopTimesByTripId.get(trip.trip_id) ?? [])]
            .sort((a, b) => a.sequence - b.sequence)
            .filter((stopTime) => stopsById.has(stopTime.stopId));
        if (stopTimes.length < 2) continue;

        const signature = stopTimes
            .map((stopTime) => stopTime.stopId)
            .join("|");
        if (linesBySignature.has(signature)) continue;

        linesBySignature.set(
            signature,
            stopTimes.map((stopTime) => {
                const stop = stopsById.get(stopTime.stopId);
                return [Number(stop.stop_lon), Number(stop.stop_lat)];
            }),
        );
    }

    return [...linesBySignature.values()];
}

function stationKey(stopId, lng, lat) {
    return `${stopId}:${lng.toFixed(5)},${lat.toFixed(5)}`;
}

function normalizeColor(value, fallback) {
    if (!value) return fallback;
    return value.startsWith("#") ? value : `#${value}`;
}

function calculateBbox(coordinates) {
    if (coordinates.length === 0) return [0, 0, 0, 0];
    return coordinates.reduce(
        ([west, south, east, north], [lng, lat]) => [
            Math.min(west, lng),
            Math.min(south, lat),
            Math.max(east, lng),
            Math.max(north, lat),
        ],
        [Infinity, Infinity, -Infinity, -Infinity],
    );
}

function getArray(map, key) {
    if (!map.has(key)) map.set(key, []);
    return map.get(key);
}

function getSet(map, key) {
    if (!map.has(key)) map.set(key, new Set());
    return map.get(key);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}
