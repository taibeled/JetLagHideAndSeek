import { render } from "@testing-library/react-native";

import type { OsmMatchingRenderState } from "@/features/questions/matching/matchingTypes";

import { OsmMatchingLayers } from "../OsmMatchingLayers";

const mockOsmMatching: OsmMatchingRenderState = {
    hitMaskFeatures: { features: [], type: "FeatureCollection" },
    missMaskFeatures: { features: [], type: "FeatureCollection" },
    poiFeatures: {
        features: [
            {
                geometry: {
                    coordinates: [139.761, 35.681],
                    type: "Point",
                },
                properties: {
                    isSelected: true,
                    name: "Selected Park",
                    osmId: 1,
                },
                type: "Feature",
            },
            {
                geometry: {
                    coordinates: [139.765, 35.685],
                    type: "Point",
                },
                properties: {
                    isSelected: false,
                    name: "Other Park",
                    osmId: 2,
                },
                type: "Feature",
            },
        ],
        type: "FeatureCollection",
    },
};

describe("OsmMatchingLayers", () => {
    it("renders shape source with POI features", () => {
        const screen = render(
            <OsmMatchingLayers osmMatching={mockOsmMatching} />,
        );

        const source = screen
            .getAllByTestId("map-shape-source")
            .find((s) => s.props.id === "osm-matching-pois");
        expect(source).toBeTruthy();
        expect(source?.props.shape.features).toHaveLength(2);
    });

    it("renders selected POI layer with red stroke filter", () => {
        const screen = render(
            <OsmMatchingLayers osmMatching={mockOsmMatching} />,
        );

        const selectedLayer = screen
            .getAllByTestId("map-circle-layer")
            .find((l) => l.props.id === "osm-matching-poi-selected");
        expect(selectedLayer).toBeTruthy();
        expect(selectedLayer?.props.filter).toEqual(["==", "isSelected", true]);
        expect(selectedLayer?.props.style.circleStrokeColor).toBe("#e53935");
        expect(selectedLayer?.props.style.circleRadius).toBe(7);
    });

    it("renders unselected POI layer with black stroke filter", () => {
        const screen = render(
            <OsmMatchingLayers osmMatching={mockOsmMatching} />,
        );

        const unselectedLayer = screen
            .getAllByTestId("map-circle-layer")
            .find((l) => l.props.id === "osm-matching-poi-unselected");
        expect(unselectedLayer).toBeTruthy();
        expect(unselectedLayer?.props.filter).toEqual([
            "==",
            "isSelected",
            false,
        ]);
        expect(unselectedLayer?.props.style.circleStrokeColor).toBe("#000000");
        expect(unselectedLayer?.props.style.circleRadius).toBe(6);
    });

    it("renders nothing when no POI features", () => {
        const emptyState: OsmMatchingRenderState = {
            hitMaskFeatures: { features: [], type: "FeatureCollection" },
            missMaskFeatures: { features: [], type: "FeatureCollection" },
            poiFeatures: { features: [], type: "FeatureCollection" },
        };
        const screen = render(<OsmMatchingLayers osmMatching={emptyState} />);

        expect(screen.queryByTestId("map-shape-source")).toBeNull();
    });
});
