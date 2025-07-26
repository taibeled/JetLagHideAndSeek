import type { LatLngTuple } from "leaflet";

import type { APILocations, OpenStreetMap } from "./types";

export const convertToLongLat = (coordinates: LatLngTuple): number[] => {
    return [coordinates[1], coordinates[0]];
};

export const convertToLatLong = (coordinates: number[]): LatLngTuple => {
    return [coordinates[1], coordinates[0]];
};

export const prettifyLocation = (
    location: APILocations,
    plural: boolean = false,
): string => {
    if (plural) {
        switch (location) {
            case "library":
                return "Libraries";
            default:
                return prettifyLocation(location) + "s";
        }
    }

    switch (location) {
        case "aquarium":
            return "Aquarium";
        case "hospital":
            return "Hospital";
        case "museum":
            return "Museum";
        case "theme_park":
            return "Theme Park";
        case "zoo":
            return "Zoo";
        case "cinema":
            return "Cinema";
        case "library":
            return "Library";
        case "golf_course":
            return "Golf Course";
        case "consulate":
            return "Foreign Consulate";
        case "park":
            return "Park";
    }
};

export const determineName = (feature: OpenStreetMap) => {
    const props = feature.properties;
    if (props.osm_type === "R") {
        const parts = [props.name, props.state, props.country].filter(Boolean);
        return parts.join(", ");
    } else {
        const parts = [
            (props as any).housenumber
                ? `${(props as any).housenumber} ${(props as any).street}`
                : (props as any).street,
            (props as any).city,
            (props as any).county,
            props.state,
            props.country,
        ].filter(Boolean);
        return parts.join(", ");
    }
};
