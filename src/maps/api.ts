import type { LatLngTuple } from "leaflet";
import osmtogeojson from "osmtogeojson";
import type { TentacleQuestion, TentacleLocations } from "./tentacles";
import * as turf from "@turf/turf";

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

export const getOverpassData = async (query: string) => {
    const response = await fetch(
        `${OVERPASS_API}?data=${encodeURIComponent(query)}`,
        {
            cache: "force-cache",
            headers: {
                "Cache-Control": "max-age=604800", // 7 days in seconds
            },
        }
    );
    const data = await response.json();
    return data;
};

export const determineGeoJSON = async (
    osmId: string,
    osmTypeLetter: "W" | "R" | "N"
): Promise<any> => {
    const osmTypeMap: { [key: string]: string } = {
        W: "way",
        R: "relation",
        N: "node",
    };

    const osmType = osmTypeMap[osmTypeLetter];

    const query = `[out:json];${osmType}(${osmId});out geom;`;
    const data = await getOverpassData(query);

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

const tentacleFirstTag: { [key in TentacleLocations]: "amenity" | "tourism" } =
    {
        aquarium: "tourism",
        hospital: "amenity",
        museum: "tourism",
        theme_park: "tourism",
        zoo: "tourism",
    };

export const findTentacleLocations = async (question: TentacleQuestion) => {
    const query = `
[out:json][timeout:25];
nw["${tentacleFirstTag[question.locationType]}"="${question.locationType}"](around:${turf.convertLength(question.radius, question.unit, "meters")}, ${
        question.lat
    }, ${question.lng});
out center;
    `;
    const data = await getOverpassData(query);

    const elements = data.elements;

    const response = turf.points([]);

    elements.forEach((element: any) => {
        if (!element.tags["name"] && !element.tags["name:en"]) return;
        if (!element.center || !element.center.lon || !element.center.lat)
            return;

        const name = element.tags["name:en"] ?? element.tags["name"];

        if (
            response.features.find(
                (feature: any) => feature.properties.name === name
            )
        )
            return;

        response.features.push(
            turf.point([element.center.lon, element.center.lat], {
                name,
            })
        );
    });

    return response;
};

export const findAdminBoundary = async (
    latitude: number,
    longitude: number,
    adminLevel: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
) => {
    const query = `
[out:json];
is_in(${latitude}, ${longitude})->.a;
rel(pivot.a)["admin_level"="${adminLevel}"];
out geom;
    `;

    const data = await getOverpassData(query);

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
            feature.geometry.coordinates as number[]
        );
        if (!feature.properties.extent) return;
        feature.properties.extent = [
            feature.properties.extent[1],
            feature.properties.extent[0],
            feature.properties.extent[3],
            feature.properties.extent[2],
        ];
    });

    return features.filter((feature) => {
        return feature.properties.osm_type === "R";
    });
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
