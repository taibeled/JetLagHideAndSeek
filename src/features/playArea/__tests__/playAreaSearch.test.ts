import {
    mapPhotonFeaturesToPlayAreaResults,
    searchPlayAreas,
} from "../playAreaSearch";

describe("searchPlayAreas", () => {
    beforeEach(() => {
        globalThis.fetch = jest.fn();
    });

    it("throws on Photon API error", async () => {
        (globalThis.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
        });

        await expect(searchPlayAreas("Osaka")).rejects.toThrow(
            "Photon search error 500",
        );
    });
});

describe("mapPhotonFeaturesToPlayAreaResults", () => {
    it("keeps relation results and deduplicates by OSM ID", () => {
        const results = mapPhotonFeaturesToPlayAreaResults([
            {
                properties: {
                    country: "Japan",
                    name: "Osaka",
                    osm_id: 358674,
                    osm_type: "R",
                    state: "Osaka Prefecture",
                },
            },
            {
                properties: {
                    name: "Osaka duplicate",
                    osm_id: 358674,
                    osm_type: "R",
                },
            },
            {
                properties: {
                    name: "Osaka Station",
                    osm_id: 123,
                    osm_type: "N",
                },
            },
        ]);

        expect(results).toEqual([
            {
                country: "Japan",
                label: "Osaka",
                osmId: 358674,
                state: "Osaka Prefecture",
            },
        ]);
    });
});
