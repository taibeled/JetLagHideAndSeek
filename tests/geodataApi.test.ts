import { expect, test, vi } from "vitest";

const cacheFetch = vi.hoisted(() => vi.fn());
vi.mock("@/maps/api/cache", () => ({ cacheFetch }));
import { fetchGeodataFeatures } from "@/maps/api/jetlagGeodata";

test("partial POI data cannot become a committed answer", async () => {
    cacheFetch.mockResolvedValue(
        Response.json({
            type: "FeatureCollection",
            features: [],
            complete: false,
        }),
    );
    await expect(
        fetchGeodataFeatures("museum", [0, 0, 1, 1], 0, 0),
    ).rejects.toThrow("incomplete");
});
