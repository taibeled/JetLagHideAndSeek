import { describe, expect, it } from "vitest";

import { GTFS_PRESETS } from "@/lib/transit/presets";

describe("GTFS_PRESETS catalog", () => {
    it("has unique system ids", () => {
        const ids = GTFS_PRESETS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("has stable slug-safe ids (lowercase, alnum + dashes)", () => {
        for (const p of GTFS_PRESETS) {
            expect(p.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
        }
    });

    it("public presets carry an https URL or a same-origin path", () => {
        // Game-day feeds are bundled in public/gtfs/ and served same-origin
        // (e.g. "/gtfs/njt-rail.zip"); MTA feeds use absolute https URLs.
        // In dev, nyct-subway also resolves to a same-origin "/gtfs/..." path.
        for (const p of GTFS_PRESETS) {
            if (p.kind === "public") {
                expect(p.url).toMatch(/^(https?:\/\/|\/)/);
            }
        }
    });

    it("byo-url presets carry a portal URL", () => {
        for (const p of GTFS_PRESETS) {
            if (p.kind === "byo-url") {
                expect(p.portalUrl).toMatch(/^https?:\/\//);
                expect(p.reason.length).toBeGreaterThan(0);
            }
        }
    });

    it("every preset has a name, agency, region, description", () => {
        for (const p of GTFS_PRESETS) {
            expect(p.name.length).toBeGreaterThan(0);
            expect(p.agency.length).toBeGreaterThan(0);
            expect(p.region.length).toBeGreaterThan(0);
            expect(p.description.length).toBeGreaterThan(0);
        }
    });
});
