import { buildOsmRasterStyleJson } from "../mapStyle";

describe("buildOsmRasterStyleJson", () => {
    it("returns valid MapLibre style JSON with OSM raster tiles", () => {
        const style = JSON.parse(buildOsmRasterStyleJson());

        expect(style.version).toBe(8);
        expect(style.sources.osm.type).toBe("raster");
        expect(style.sources.osm.tiles).toEqual([
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ]);
        expect(style.layers).toEqual([
            {
                id: "osm-raster",
                source: "osm",
                type: "raster",
            },
        ]);
    });
});
