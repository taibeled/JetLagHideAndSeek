import * as Location from "expo-location";
import { useCallback, useState } from "react";
import type { RefObject } from "react";

import { flyCameraToCoordinate, type CameraHandle } from "./camera";
import type { Position } from "./geojsonTypes";

export type LocationModule = Pick<
    typeof Location,
    "getCurrentPositionAsync" | "requestForegroundPermissionsAsync"
> & {
    Accuracy: {
        Balanced: Location.Accuracy;
    };
};

export type UserCoordinateResult =
    | { coordinate: Position; status: "granted" }
    | { coordinate: null; status: "denied" | "undetermined" | "unavailable" };

export async function requestUserCoordinate(
    locationModule: LocationModule = Location,
): Promise<UserCoordinateResult> {
    let status: Location.PermissionStatus;
    try {
        ({ status } = await locationModule.requestForegroundPermissionsAsync());
    } catch {
        return { coordinate: null, status: "unavailable" };
    }

    if (status !== "granted") {
        return { coordinate: null, status };
    }

    let position: Location.LocationObject;
    try {
        position = await locationModule.getCurrentPositionAsync({
            accuracy: locationModule.Accuracy.Balanced,
        });
    } catch {
        return { coordinate: null, status: "unavailable" };
    }

    return {
        coordinate: [position.coords.longitude, position.coords.latitude],
        status: "granted",
    };
}

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
