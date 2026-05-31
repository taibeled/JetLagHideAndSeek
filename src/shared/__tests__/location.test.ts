import { requestUserCoordinate } from "../location";

describe("requestUserCoordinate", () => {
    it("returns the current coordinate when permission is granted", async () => {
        const locationModule = {
            Accuracy: { Balanced: 3 },
            getCurrentPositionAsync: jest.fn().mockResolvedValue({
                coords: { latitude: 35.6762, longitude: 139.6503 },
            }),
            requestForegroundPermissionsAsync: jest
                .fn()
                .mockResolvedValue({ status: "granted" }),
        };

        await expect(requestUserCoordinate(locationModule)).resolves.toEqual({
            coordinate: [139.6503, 35.6762],
            status: "granted",
        });
        expect(locationModule.getCurrentPositionAsync).toHaveBeenCalledWith({
            accuracy: 3,
        });
    });

    it("does not request a GPS fix when permission is denied", async () => {
        const locationModule = {
            Accuracy: { Balanced: 3 },
            getCurrentPositionAsync: jest.fn(),
            requestForegroundPermissionsAsync: jest
                .fn()
                .mockResolvedValue({ status: "denied" }),
        };

        await expect(requestUserCoordinate(locationModule)).resolves.toEqual({
            coordinate: null,
            status: "denied",
        });
        expect(locationModule.getCurrentPositionAsync).not.toHaveBeenCalled();
    });

    it("returns unavailable when the GPS fix fails", async () => {
        const locationModule = {
            Accuracy: { Balanced: 3 },
            getCurrentPositionAsync: jest
                .fn()
                .mockRejectedValue(new Error("Cannot obtain current location")),
            requestForegroundPermissionsAsync: jest
                .fn()
                .mockResolvedValue({ status: "granted" }),
        };

        await expect(requestUserCoordinate(locationModule)).resolves.toEqual({
            coordinate: null,
            status: "unavailable",
        });
        expect(locationModule.getCurrentPositionAsync).toHaveBeenCalledWith({
            accuracy: 3,
        });
    });

    it("returns unavailable when the permission request fails", async () => {
        const locationModule = {
            Accuracy: { Balanced: 3 },
            getCurrentPositionAsync: jest.fn(),
            requestForegroundPermissionsAsync: jest
                .fn()
                .mockRejectedValue(new Error("Location module unavailable")),
        };

        await expect(requestUserCoordinate(locationModule)).resolves.toEqual({
            coordinate: null,
            status: "unavailable",
        });
        expect(locationModule.getCurrentPositionAsync).not.toHaveBeenCalled();
    });
});
