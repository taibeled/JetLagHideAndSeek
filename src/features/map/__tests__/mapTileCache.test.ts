import { OfflineManager } from "@maplibre/maplibre-react-native";

import {
    AMBIENT_TILE_CACHE_SIZE_BYTES,
    clearNativeTileCacheConfigurationForTests,
    configureNativeTileCache,
} from "../mapTileCache";

const setMaximumAmbientCacheSize =
    OfflineManager.setMaximumAmbientCacheSize as jest.MockedFunction<
        typeof OfflineManager.setMaximumAmbientCacheSize
    >;

describe("configureNativeTileCache", () => {
    beforeEach(() => {
        clearNativeTileCacheConfigurationForTests();
        setMaximumAmbientCacheSize.mockReset();
        setMaximumAmbientCacheSize.mockResolvedValue(undefined);
    });

    it("configures a bounded native ambient cache once per app process", async () => {
        const first = configureNativeTileCache();
        const second = configureNativeTileCache();

        expect(first).toBe(second);
        await expect(first).resolves.toBeUndefined();
        expect(setMaximumAmbientCacheSize).toHaveBeenCalledTimes(1);
        expect(setMaximumAmbientCacheSize).toHaveBeenCalledWith(
            AMBIENT_TILE_CACHE_SIZE_BYTES,
        );
    });

    it("allows a later startup attempt to retry after configuration fails", async () => {
        setMaximumAmbientCacheSize.mockRejectedValueOnce(
            new Error("native cache unavailable"),
        );

        await expect(configureNativeTileCache()).rejects.toThrow(
            "native cache unavailable",
        );
        await expect(configureNativeTileCache()).resolves.toBeUndefined();
        expect(setMaximumAmbientCacheSize).toHaveBeenCalledTimes(2);
    });
});
