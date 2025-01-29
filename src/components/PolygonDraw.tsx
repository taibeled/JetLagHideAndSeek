import "leaflet-draw/dist/leaflet.draw.css";
import { FeatureGroup } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import * as L from "leaflet";
import { useRef } from "react";
import * as turf from "@turf/turf";
import { mapGeoJSON, polyGeoJSON, questions } from "@/utils/context";

export const PolygonDraw = () => {
    const featureRef = useRef<any | null>(null);

    // @ts-ignore
    L.drawLocal.draw.toolbar.buttons.polygon = "Draw the hiding zone!";

    const onChange = () => {
        if (!featureRef.current?._layers) return;

        const layers = featureRef.current._layers;
        const geoJSONs = Object.values(layers).map((layer: any) =>
            layer.toGeoJSON()
        );
        const geoJSON = turf.featureCollection(geoJSONs);

        mapGeoJSON.set(geoJSON);
        polyGeoJSON.set(geoJSON);
        questions.set([]);
    };

    return (
        <FeatureGroup ref={featureRef}>
            <EditControl
                position="bottomleft"
                draw={{
                    rectangle: false,
                    circle: false,
                    circlemarker: false,
                    marker: false,
                    polyline: false,
                    polygon: {
                        shapeOptions: {fillOpacity: 0}
                    },
                }}
                onCreated={onChange}
                onEdited={onChange}
                onDeleted={onChange}
            />
        </FeatureGroup>
    );
};
