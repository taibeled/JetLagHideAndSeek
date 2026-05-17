export type RasterMapStyle = {
    glyphs?: string;
    layers: Array<Record<string, unknown>>;
    sources: Record<string, Record<string, unknown>>;
    version: 8;
};

export function buildOsmRasterStyle(): RasterMapStyle {
    return {
        version: 8,
        sources: {
            osm: {
                attribution: "© OpenStreetMap contributors",
                maxzoom: 19,
                tileSize: 256,
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                type: "raster",
            },
        },
        layers: [
            {
                id: "osm-raster",
                source: "osm",
                type: "raster",
            },
        ],
    };
}

export function buildOsmRasterStyleJson(): string {
    return JSON.stringify(buildOsmRasterStyle());
}
