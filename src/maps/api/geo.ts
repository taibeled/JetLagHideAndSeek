import type { LatLngTuple } from "leaflet";

import type { APILocations, OpenStreetMap } from "./types";

export const convertToLongLat = (coordinates: LatLngTuple): number[] => {
    return [coordinates[1], coordinates[0]];
};

export const convertToLatLong = (coordinates: number[]): LatLngTuple => {
    return [coordinates[1], coordinates[0]];
};

export const prettifyLocation = (location: APILocations) => {
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
    if (feature.properties.state) {
        return `${feature.properties.name}, ${feature.properties.state}, ${feature.properties.country}`;
    } else if (feature.properties.country) {
        return `${feature.properties.name}, ${feature.properties.country}`;
    } else {
        return feature.properties.name;
    }
};
