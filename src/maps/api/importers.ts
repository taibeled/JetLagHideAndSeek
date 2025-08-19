import type { Feature, FeatureCollection, GeoJSON, Point } from "geojson";

import type { CustomStation } from "./types";

function parseCSV(text: string): CustomStation[] {
    // Expect headers including lat/lng or latitude/longitude; optional name,id
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    if (lines.length === 0) return [];
    const header = lines[0]
        .split(/,|\t|;|\|/)
        .map((h) => h.trim().toLowerCase());
    const latIdx = header.findIndex((h) => ["lat", "latitude"].includes(h));
    const lngIdx = header.findIndex((h) =>
        ["lng", "lon", "long", "longitude"].includes(h),
    );
    const nameIdx = header.findIndex((h) =>
        ["name", "title", "station", "label"].includes(h),
    );
    const idIdx = header.findIndex((h) =>
        ["id", "station_id", "osm_id"].includes(h),
    );
    const delimiter = lines[0].includes("\t")
        ? "\t"
        : lines[0].includes(";")
          ? ";"
          : lines[0].includes("|")
            ? "|"
            : ",";

    const stations: CustomStation[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map((c) => c.trim());
        if (latIdx < 0 || lngIdx < 0) continue;
        const lat = parseFloat(cols[latIdx]);
        const lng = parseFloat(cols[lngIdx]);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const name = nameIdx >= 0 ? cols[nameIdx] : undefined;
        const id = idIdx >= 0 && cols[idIdx] ? cols[idIdx] : `${lat},${lng}`;
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

export function normalizeToStationFeatures(stations: CustomStation[]) {
    // Return GeoJSON FeatureCollection of Points carrying properties { id, name }
    const features: Feature<Point>[] = stations.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: { id: s.id, name: s.name },
    }));
    return { type: "FeatureCollection", features } as FeatureCollection<Point>;
}
