import {
    bboxToMapLibreBounds,
    fitCameraToBbox,
    flyCameraToCoordinate,
    getTopViewportFitPadding,
} from "../camera";

describe("camera helpers", () => {
    it("converts bbox to MapLibre northeast/southwest bounds", () => {
        expect(bboxToMapLibreBounds([135, 20, 154, 36])).toEqual({
            ne: [154, 36],
            sw: [135, 20],
        });
    });

    it("fits a camera to a bbox", () => {
        const camera = { fitBounds: jest.fn() };

        fitCameraToBbox(camera, [135, 20, 154, 36], 64, 500);

        expect(camera.fitBounds).toHaveBeenCalledWith(
            [154, 36],
            [135, 20],
            64,
            500,
        );
    });

    it("fits a camera to a bbox with asymmetric padding", () => {
        const camera = { setCamera: jest.fn() };

        fitCameraToBbox(
            camera,
            [139.5, 35.4, 139.9, 35.8],
            {
                paddingBottom: 400,
                paddingLeft: 40,
                paddingRight: 40,
                paddingTop: 160,
            },
            500,
        );

        expect(camera.setCamera).toHaveBeenCalledWith({
            animationDuration: 500,
            animationMode: "easeTo",
            bounds: {
                ne: [139.9, 35.8],
                paddingBottom: 400,
                paddingLeft: 40,
                paddingRight: 40,
                paddingTop: 160,
                sw: [139.5, 35.4],
            },
        });
    });

    it("calculates padding for fitting the play area above the drawer", () => {
        expect(getTopViewportFitPadding({ height: 844, topInset: 47 })).toEqual(
            {
                paddingBottom: 405,
                paddingLeft: 40,
                paddingRight: 40,
                paddingTop: 167,
            },
        );
    });

    it("flies a camera to a coordinate", () => {
        const camera = { setCamera: jest.fn() };

        flyCameraToCoordinate(camera, [139.6503, 35.6762]);

        expect(camera.setCamera).toHaveBeenCalledWith({
            animationDuration: 700,
            animationMode: "flyTo",
            centerCoordinate: [139.6503, 35.6762],
            zoomLevel: 13,
        });
    });
});
