import * as boston from '@/locations/boston';
import type { AdditionalMapGeoLocations, OpenStreetMap } from '@/maps/api';

export type PresetLocation = {
    displayName: string;
    slug: string;
    mapGeoLocation: OpenStreetMap;
    additionalMapGeoLocations: AdditionalMapGeoLocations[];
}

export enum PresetLocationSlug {
    BOSTON = 'boston'
}

export const PRESET_LOCATIONS: PresetLocation[] = [
    {
        displayName: 'Boston',
        slug: PresetLocationSlug.BOSTON,
        mapGeoLocation: boston.mapGeoLocation,
        additionalMapGeoLocations: boston.additionalMapGeoLocations,
    }
];

export const DEFAULT_LOCATION = PRESET_LOCATIONS[0];