import { persistentAtom } from "@nanostores/persistent";
import { atom } from "nanostores";
import type { LatLng, Stop } from "./types";

export const isLoading = atom<boolean>(false);

export const mbtaRoutes = persistentAtom<any[]>(
    "mbtaRoutes",
    [],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const mbtaStops = persistentAtom<any[]>(
    "mbtaStops",
    [],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    }
)

export const updateMbtaStopData = (id: string, data: Stop[]) => {
    const currentData = mbtaStops.get();
    mbtaStops.set(
        {
            ...currentData,
            [id]: data
        }
    );
}

export const mbtaData = persistentAtom<Record<string, any>>(
    "mbtaData",
    {},
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const updateMbtaRouteData = (
    id: string,
    data: LatLng[],
) => {
    const currentData = mbtaData.get();
    mbtaData.set(
        {
            ...currentData,
            [id]: data
        }
    );
};
