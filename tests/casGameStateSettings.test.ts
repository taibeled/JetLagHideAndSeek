import { afterEach, describe, expect, it } from "vitest";

import {
    defaultUnit,
    displayHidingZonesStyle,
    hidingRadius,
    hidingRadiusUnits,
    hidingZone,
} from "@/lib/context";
import {
    applyHidingZoneGeojson,
    applyWireV1Payload,
} from "@/lib/loadHidingZone";
import { buildWireV1Envelope } from "@/lib/wire";

const basePayload = {
    type: "Feature",
    geometry: {
        type: "Point",
        coordinates: [139.2394179, 36.5748441],
    },
    properties: {
        osm_type: "R",
        osm_id: 382313,
        osm_key: "place",
        countrycode: "JP",
        osm_value: "country",
        name: "Japan",
        type: "country",
        isHidingZone: true,
        questions: [],
    },
};

afterEach(() => {
    defaultUnit.set("miles");
    hidingRadius.set(0.5);
    hidingRadiusUnits.set("miles");
    displayHidingZonesStyle.set("zones");
});

describe("CAS game state settings", () => {
    it("includes unit and hiding-zone display settings in the wire payload", () => {
        defaultUnit.set("kilometers");
        hidingRadius.set(1.25);
        hidingRadiusUnits.set("meters");
        displayHidingZonesStyle.set("no-overlap");

        const wire = buildWireV1Envelope(hidingZone.get());

        expect(wire).toMatchObject({
            defaultUnit: "kilometers",
            hidingRadius: 1.25,
            hidingRadiusUnits: "meters",
            displayHidingZonesStyle: "no-overlap",
        });
    });

    it("restores shared unit and hiding-zone display settings from CAS", () => {
        defaultUnit.set("miles");
        hidingRadius.set(0.5);
        hidingRadiusUnits.set("miles");
        displayHidingZonesStyle.set("zones");

        applyWireV1Payload(
            JSON.stringify({
                v: 1,
                ...basePayload,
                defaultUnit: "kilometers",
                hidingRadius: 2.75,
                hidingRadiusUnits: "meters",
                displayHidingZonesStyle: "no-overlap",
            }),
        );

        expect(defaultUnit.get()).toBe("kilometers");
        expect(hidingRadius.get()).toBe(2.75);
        expect(hidingRadiusUnits.get()).toBe("meters");
        expect(displayHidingZonesStyle.get()).toBe("no-overlap");
    });

    it("leaves local settings intact for legacy payloads without the new keys", () => {
        defaultUnit.set("kilometers");
        hidingRadius.set(1.5);
        hidingRadiusUnits.set("meters");
        displayHidingZonesStyle.set("no-display");

        applyWireV1Payload(JSON.stringify({ v: 1, ...basePayload }));

        expect(defaultUnit.get()).toBe("kilometers");
        expect(hidingRadius.get()).toBe(1.5);
        expect(hidingRadiusUnits.get()).toBe("meters");
        expect(displayHidingZonesStyle.get()).toBe("no-display");
    });

    it("ignores invalid shared setting values", () => {
        defaultUnit.set("kilometers");
        hidingRadius.set(1.5);
        hidingRadiusUnits.set("meters");
        displayHidingZonesStyle.set("no-display");

        applyHidingZoneGeojson({
            ...basePayload,
            defaultUnit: "yards",
            hidingRadius: Number.POSITIVE_INFINITY,
            hidingRadiusUnits: "feet",
            displayHidingZonesStyle: "everything",
        });

        expect(defaultUnit.get()).toBe("kilometers");
        expect(hidingRadius.get()).toBe(1.5);
        expect(hidingRadiusUnits.get()).toBe("meters");
        expect(displayHidingZonesStyle.get()).toBe("no-display");
    });
});
