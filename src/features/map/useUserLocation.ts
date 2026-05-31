import { useCallback, useState } from "react";
import type { RefObject } from "react";

import { requestUserCoordinate } from "@/shared/location";
import type { Position } from "@/shared/geojson";

import { flyCameraToCoordinate, type CameraHandle } from "./camera";

export { type UserCoordinateResult } from "@/shared/location";

export function useUserLocation(cameraRef: RefObject<CameraHandle | null>) {
    const [hasLocationPermission, setHasLocationPermission] = useState(false);
    const [userCoordinate, setUserCoordinate] = useState<Position | null>(null);

    const locateUser = useCallback(async () => {
        const result = await requestUserCoordinate();

        if (result.status !== "granted") {
            setHasLocationPermission(false);
            return result;
        }

        setHasLocationPermission(true);
        setUserCoordinate(result.coordinate);
        flyCameraToCoordinate(cameraRef.current, result.coordinate);
        return result;
    }, [cameraRef]);

    const handleLocationUpdate = useCallback(
        (location: { coords: { latitude: number; longitude: number } }) => {
            setUserCoordinate([
                location.coords.longitude,
                location.coords.latitude,
            ]);
        },
        [],
    );

    return {
        handleLocationUpdate,
        hasLocationPermission,
        locateUser,
        userCoordinate,
    };
}
