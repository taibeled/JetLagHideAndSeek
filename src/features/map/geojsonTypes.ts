import type { Bbox, Position } from "@/shared/geojson";

export type { Bbox, Position };

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
