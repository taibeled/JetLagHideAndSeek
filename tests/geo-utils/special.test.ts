import { describe, expect, it } from "vitest";

import { lngLatToText } from "@/maps/geo-utils/special";

describe("lngLatToText formats coordinates", () => {
    const cases: [string, [number, number], string][] = [
        ["in North/East hemisphere", [4, 52], "52°N, 4°E"],
        ["in North/West hemisphere", [-74, 40], "40°N, 74°W"],
        ["in South/East hemisphere", [151, -33], "33°S, 151°E"],
        ["in South/West hemisphere", [-58, -34], "34°S, 58°W"],
        ["on the equator (latitude 0 gives S)", [10, 0], "0°S, 10°E"],
        ["on the prime meridian (longitude 0 gives W)", [0, 45], "45°N, 0°W"],
        ["at origin (equator and prime meridian)", [0, 0], "0°S, 0°W"],
        [
            "(negative) correctly with absolute values",
            [-120.5, -35.7],
            "35.7°S, 120.5°W",
        ],
    ];
    it.each(cases)("%s", (_label, input, expected: string) => {
        expect(lngLatToText(input)).toBe(expected);
    });
});
