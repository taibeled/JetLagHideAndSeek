import { describe, expect, test } from "vitest";

import {
  connectToSeparateLines,
  extractStationLabel,
  extractStationName,
  groupObjects,
  lngLatToText,
} from "./special";

describe("lngLatToText", () => {
  test("formats positive lat/lng as N/E", () => {
    expect(lngLatToText([139.6917, 35.6895])).toBe("35.6895°N, 139.6917°E");
  });

  test("formats positive lat, negative lng as N/W", () => {
    expect(lngLatToText([-0.1276, 51.5074])).toBe("51.5074°N, 0.1276°W");
  });

  test("formats negative lat, negative lng as S/W", () => {
    expect(lngLatToText([-74.006, -33.8688])).toBe("33.8688°S, 74.006°W");
  });
});

describe("extractStationName", () => {
  const featureBoth = {
    properties: { name: "東京", "name:en": "Tokyo" },
  };

  test("english-preferred returns English name when both present", () => {
    expect(extractStationName(featureBoth, "english-preferred")).toBe("Tokyo");
  });

  test("native-preferred returns native name when both present", () => {
    expect(extractStationName(featureBoth, "native-preferred")).toBe("東京");
  });

  test("only native name returns native for both strategies", () => {
    const feature = { properties: { name: "東京" } };
    expect(extractStationName(feature, "english-preferred")).toBe("東京");
    expect(extractStationName(feature, "native-preferred")).toBe("東京");
  });

  test("only English name returns English for both strategies", () => {
    const feature = { properties: { "name:en": "Tokyo" } };
    expect(extractStationName(feature, "english-preferred")).toBe("Tokyo");
    expect(extractStationName(feature, "native-preferred")).toBe("Tokyo");
  });
});

describe("extractStationLabel", () => {
  test("returns name from extractStationName when present", () => {
    const feature = {
      properties: { name: "東京", "name:en": "Tokyo" },
      geometry: { coordinates: [139.6917, 35.6895] },
    };
    expect(extractStationLabel(feature, "english-preferred")).toBe("Tokyo");
  });

  test("falls back to lngLatToText when no names available", () => {
    const feature = {
      properties: {},
      geometry: { coordinates: [139.6917, 35.6895] },
    };
    expect(extractStationLabel(feature)).toBe("35.6895°N, 139.6917°E");
  });
});

describe("groupObjects", () => {
  test("groups objects with same name:en together", () => {
    const objects = [
      { properties: { "name:en": "Tokyo", network: "JR" } },
      { properties: { "name:en": "Tokyo", network: "Metro" } },
    ];
    const result = groupObjects(objects);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  test("separates objects with completely different properties", () => {
    const objects = [
      { properties: { name: "A" } },
      { properties: { name: "B" } },
    ];
    const result = groupObjects(objects);
    expect(result).toHaveLength(2);
  });

  test("groups objects with same network but different names", () => {
    const objects = [
      { properties: { name: "Shinjuku", network: "JR" } },
      { properties: { name: "Tokyo", network: "JR" } },
    ];
    const result = groupObjects(objects);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  test("returns empty array for empty input", () => {
    expect(groupObjects([])).toEqual([]);
  });

  test("filters out objects without name/name:en/network and groups remainder", () => {
    const objects = [
      { properties: {} },
      { properties: { "name:en": "Tokyo" } },
      { properties: { other: "value" } },
    ];
    const result = groupObjects(objects);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
  });
});
