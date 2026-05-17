export type Position = [number, number];

export type Bbox = [number, number, number, number];

export type PolygonGeometry = {
    coordinates: Position[][] | Position[][][];
    type: "Polygon" | "MultiPolygon";
};

export type GeoJsonFeature = {
    bbox?: Bbox;
    geometry: PolygonGeometry;
    id?: string;
    properties?: Record<string, unknown>;
    type: "Feature";
};

export type GeoJsonFeatureCollection = {
    features: GeoJsonFeature[];
    type: "FeatureCollection";
};
