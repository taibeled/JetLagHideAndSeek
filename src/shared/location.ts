import * as Location from "expo-location";

import type { Position } from "./geojson";

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
