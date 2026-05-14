// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck This should not be edited
import "leaflet-easyprint";

import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

export const MapPrint = (props) => {
    const map = useMap();

    useEffect(() => {
        const control = L.easyPrint({
            ...props,
        });
        map.addControl(control);
        return () => {
            map.removeControl(control);
        };
        // Props are captured once at mount by design — the print
        // control is re-created on `map` changes only.
    }, [map]);

    return null;
};
