import { describe, expect, it } from "vitest";

import { parseCustomStationsFromText } from "@/maps/api";

describe("parseCustomStationsFromText", () => {
    it("parses CSV with headers lat,lng,name", () => {
        const csv =
            "lat,lng,name\n37.7749,-122.4194,San Francisco\n37.784,-122.41,Station B";
        const stations = parseCustomStationsFromText(csv, "text/csv");
        expect(stations.length).toBe(2);
        expect(stations[0]).toMatchObject({
            lat: 37.7749,
            lng: -122.4194,
            name: "San Francisco",
        });
    });

    it("parses GeoJSON FeatureCollection of Points", () => {
        const gj = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [-122.3, 37.6] },
                    properties: { id: "node/1", name: "Foo" },
                },
            ],
        };
        const stations = parseCustomStationsFromText(
            JSON.stringify(gj),
            "application/json",
        );
        expect(stations.length).toBe(1);
        expect(stations[0]).toMatchObject({
            id: "node/1",
            name: "Foo",
            lat: 37.6,
            lng: -122.3,
        });
    });

    it("parses KML Placemark Points", () => {
        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test Station</name>
      <Point>
        <coordinates>-122.5,37.7,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;
        const stations = parseCustomStationsFromText(
            kml,
            "application/vnd.google-earth.kml+xml",
        );
        expect(stations.length).toBe(1);
        expect(stations[0]).toMatchObject({
            name: "Test Station",
            lat: 37.7,
            lng: -122.5,
        });
    });
});
