import { OfflineManager } from "@maplibre/maplibre-react-native";

export const AMBIENT_TILE_CACHE_SIZE_BYTES = 100 * 1024 * 1024;

let configurationPromise: Promise<void> | undefined;

/**
 * Configure MapLibre's bounded native ambient cache before the first map style
 * loads. Do not create offline packs while the app uses tile.openstreetmap.org:
 * that endpoint permits normal caching but prohibits bulk offline downloads.
 */
export function configureNativeTileCache(): Promise<void> {
    if (!configurationPromise) {
        configurationPromise = OfflineManager.setMaximumAmbientCacheSize(
            AMBIENT_TILE_CACHE_SIZE_BYTES,
        ).catch((error: unknown) => {
            configurationPromise = undefined;
            throw error;
        });
    }

    return configurationPromise;
}

export function clearNativeTileCacheConfigurationForTests() {
    configurationPromise = undefined;
}
