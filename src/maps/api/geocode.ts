import uniqBy from "lodash/uniqBy";

import { GEOCODER_API } from "@/maps/api/constants";
import { convertToLatLong } from "@/maps/api/geo";
import type { OpenStreetMap } from "@/maps/api/types";

export const geocode = async (
    address: string,
    language: string,
    filter: boolean = true,
) => {
    const features = (
        await (
            await fetch(`${GEOCODER_API}?lang=${language}&q=${address}`)
        ).json()
    ).features as OpenStreetMap[];

    features.forEach((feature) => {
        feature.geometry.coordinates = convertToLatLong(
            feature.geometry.coordinates as number[],
        );
        if (!feature.properties.extent) return;
        feature.properties.extent = [
            feature.properties.extent[1],
            feature.properties.extent[0],
            feature.properties.extent[3],
            feature.properties.extent[2],
        ];
    });

    return uniqBy(
        features.filter((feature) => {
            return filter ? feature.properties.osm_type === "R" : true;
        }),
        (feature) => feature.properties.osm_id,
    );
};
