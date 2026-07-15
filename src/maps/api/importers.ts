import type {
    Feature,
    FeatureCollection,
    GeoJSON,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import Papa from "papaparse";

import { LOCAL_ADMIN_LEVELS, LOCAL_POINT_CATEGORIES } from "./localData";
import type {
    CustomStation,
    LocalAdminLevel,
    LocalPlaceData,
    LocalPointCategory,
    StationPlace,
    StationPlaceProperties,
} from "./types";

function parseCSV(text: string): CustomStation[] {
    const { data, errors } = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.toLowerCase().trim(),
    });

    if (errors.length > 0) {
        throw new Error(`CSV parse error: ${errors[0].message}`);
    }

    const firstRow = data[0] ?? {};
    const headers = Object.keys(firstRow);

    const latKey = headers.find((h) => ["lat", "latitude"].includes(h));
    const lngKey = headers.find((h) =>
        ["lng", "lon", "long", "longitude"].includes(h),
    );
    const nameKey = headers.find((h) =>
        ["name", "title", "station", "label"].includes(h),
    );
    const idKey = headers.find((h) =>
        ["id", "station_id", "osm_id"].includes(h),
    );

    if (!latKey)
        throw new Error("CSV missing required 'lat' or 'latitude' column");
    if (!lngKey)
        throw new Error(
            "CSV missing required 'lng', 'lon', 'long', or 'longitude' column",
        );
    if (!nameKey)
        throw new Error(
            "CSV missing required 'name', 'title', 'station', or 'label' column",
        );

    const stations: CustomStation[] = [];
    for (const row of data) {
        const lat = parseFloat(row[latKey]);
        const lng = parseFloat(row[lngKey]);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const name = row[nameKey];
        if (!name) continue;
        const id = idKey && row[idKey] ? row[idKey] : `${lat},${lng}`;
        stations.push({ id, name, lat, lng });
    }
    return stations;
}

function parseGeoJSON(obj: any): CustomStation[] {
    const stations: CustomStation[] = [];
    const pushFromFeature = (f: Feature<Point>) => {
        if (!f.geometry || f.geometry.type !== "Point") return;
        const [lng, lat] = f.geometry.coordinates;
        if (!isFinite(lat) || !isFinite(lng)) return;
        const props: any = f.properties || {};
        const name = props["name:en"] || props.name || props.title;
        const id = props.id || props.osm_id || props["@id"] || `${lat},${lng}`;
        stations.push({ id: String(id), name, lat, lng });
    };
    if (obj.type === "FeatureCollection") {
        (obj as FeatureCollection).features.forEach((f) =>
            pushFromFeature(f as Feature<Point>),
        );
    } else if (obj.type === "Feature") {
        pushFromFeature(obj as Feature<Point>);
    } else if (obj.type === "Point") {
        const [lng, lat] = (obj as GeoJSON & Point).coordinates as [
            number,
            number,
        ];
        stations.push({ id: `${lat},${lng}`, lat, lng });
    }
    return stations;
}

function parseKML(text: string): CustomStation[] {
    // Really light-weight parser for Point Placemarks; works for Google MyMaps export
    const stations: CustomStation[] = [];
    const placemarks = text.split(/<Placemark[\s>]/i).slice(1);
    for (const pm of placemarks) {
        const nameMatch = pm.match(/<name>([\s\S]*?)<\/name>/i);
        const coordsMatch = pm.match(
            /<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i,
        );
        if (!coordsMatch) continue;
        // coordinates are lng,lat[,alt]
        const coordStr = coordsMatch[1].trim().split(/\s+/)[0];
        const parts = coordStr.split(",");
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const name = nameMatch ? nameMatch[1].trim() : undefined;
        const id = `${lat},${lng}`;
        stations.push({ id, name, lat, lng });
    }
    return stations;
}

export function parseCustomStationsFromText(
    text: string,
    contentTypeHint?: string,
): CustomStation[] {
    // Try by hint
    const hint = (contentTypeHint || "").toLowerCase();
    try {
        if (hint.includes("json")) {
            return parseGeoJSON(JSON.parse(text));
        }
        if (
            hint.includes("kml") ||
            text.includes("<kml") ||
            text.includes("<Placemark")
        ) {
            return parseKML(text);
        }
        if (
            hint.includes("csv") ||
            text.includes(",lat") ||
            text.match(/lat[,;\t ]+lon|latitude/i)
        ) {
            return parseCSV(text);
        }
    } catch {
        // Fall through
    }

    // Try generic detection
    try {
        const obj = JSON.parse(text);
        return parseGeoJSON(obj);
    } catch {
        // Not JSON
    }
    if (text.includes("<kml")) {
        return parseKML(text);
    }
    return parseCSV(text);
}

const asPointCategory = (value: unknown): LocalPointCategory | null => {
    if (typeof value !== "string") return null;
    const key = value.trim().toLowerCase();
    return (LOCAL_POINT_CATEGORIES as string[]).includes(key)
        ? (key as LocalPointCategory)
        : null;
};

const asAdminLevel = (value: unknown): LocalAdminLevel | null => {
    const level =
        typeof value === "number" ? value : Number.parseInt(String(value), 10);
    return (LOCAL_ADMIN_LEVELS as number[]).includes(level)
        ? (level as LocalAdminLevel)
        : null;
};

const emptyLocalPlaceData = (): LocalPlaceData => ({
    points: {},
    boundaries: {},
});

const addPoint = (
    data: LocalPlaceData,
    category: LocalPointCategory,
    feature: Feature<Point>,
) => {
    (data.points[category] ??= []).push(feature);
};

const addBoundary = (
    data: LocalPlaceData,
    level: LocalAdminLevel,
    feature: Feature<Polygon | MultiPolygon>,
) => {
    (data.boundaries[level] ??= []).push(feature);
};

function parseLocalPlaceDataCSV(text: string): LocalPlaceData {
    const { data, errors } = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.toLowerCase().trim(),
    });

    if (errors.length > 0) {
        throw new Error(`CSV parse error: ${errors[0].message}`);
    }

    const headers = Object.keys(data[0] ?? {});
    const latKey = headers.find((h) => ["lat", "latitude"].includes(h));
    const lngKey = headers.find((h) =>
        ["lng", "lon", "long", "longitude"].includes(h),
    );
    const nameKey = headers.find((h) => ["name", "title", "label"].includes(h));
    const categoryKey = headers.find((h) => ["category", "type"].includes(h));

    if (!latKey || !lngKey) {
        throw new Error("CSV missing required latitude/longitude column");
    }
    if (!categoryKey) {
        throw new Error("CSV missing required 'category' column");
    }

    const result = emptyLocalPlaceData();
    for (const row of data) {
        const lat = parseFloat(row[latKey]);
        const lng = parseFloat(row[lngKey]);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const category = asPointCategory(row[categoryKey]);
        if (!category) continue;

        const properties: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
            if (key === latKey || key === lngKey || key === categoryKey)
                continue;
            if (value) properties[key] = value;
        }
        if (nameKey && row[nameKey]) properties.name = row[nameKey];

        addPoint(result, category, {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties,
        });
    }
    return result;
}

function parseLocalPlaceDataGeoJSON(obj: any): LocalPlaceData {
    const result = emptyLocalPlaceData();
    const features: Feature[] =
        obj.type === "FeatureCollection"
            ? obj.features
            : obj.type === "Feature"
              ? [obj]
              : [];

    for (const feature of features) {
        const geometry = feature.geometry;
        if (!geometry) continue;
        const props: any = feature.properties ?? {};

        if (geometry.type === "Point") {
            const category = asPointCategory(props.category ?? props.type);
            if (!category) continue;
            addPoint(result, category, feature as Feature<Point>);
        } else if (
            geometry.type === "Polygon" ||
            geometry.type === "MultiPolygon"
        ) {
            const level = asAdminLevel(props.admin_level);
            if (level === null) continue;
            addBoundary(
                result,
                level,
                feature as Feature<Polygon | MultiPolygon>,
            );
        }
    }
    return result;
}

/**
 * Parses a user-supplied file (CSV or GeoJSON) into `LocalPlaceData`.
 *
 * - **CSV** requires `lat`/`lng` and a `category` column; each row becomes a
 *   point under that category. Extra columns are kept as feature properties
 *   (so tags like `iata` / `name:en` flow through).
 * - **GeoJSON** routes `Point` features to `points[properties.category]` and
 *   `Polygon`/`MultiPolygon` features to `boundaries[properties.admin_level]`.
 */
export function parseLocalPlaceDataFromText(
    text: string,
    contentTypeHint?: string,
): LocalPlaceData {
    const hint = (contentTypeHint || "").toLowerCase();
    if (hint.includes("json")) {
        return parseLocalPlaceDataGeoJSON(JSON.parse(text));
    }
    if (hint.includes("csv")) {
        return parseLocalPlaceDataCSV(text);
    }

    try {
        return parseLocalPlaceDataGeoJSON(JSON.parse(text));
    } catch {
        return parseLocalPlaceDataCSV(text);
    }
}

export function normalizeToStationFeatures(
    stations: CustomStation[],
): FeatureCollection<Point, StationPlaceProperties> {
    // Return GeoJSON FeatureCollection of Points carrying properties { id, name }
    const features: StationPlace[] = stations.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: { id: s.id, name: s.name },
    }));
    return { type: "FeatureCollection", features };
}
