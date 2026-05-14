import * as turf from "@turf/turf";
import type { Feature, Point } from "geojson";
import { toast } from "react-toastify";

import {
    findPlacesInZone,
    LOCATION_FIRST_TAG,
    OVERPASS_MAJOR_CITY_FILTER,
    prettifyLocation,
} from "@/maps/api";
import { NYC_HOSPITALS } from "@/data/nyc-hospitals";
import type { APILocations } from "@/maps/schema";

/** Convert the curated NYC hospital list to Feature<Point>[] for Voronoi use. */
export function nycHospitalPoints(
    disabledRefs?: readonly string[],
): Feature<Point>[] {
    const disabled = new Set(
        (disabledRefs ?? []).map(normalizeFacilityOsmRef).filter(Boolean),
    );
    return NYC_HOSPITALS.filter(
        (h) => !disabled.has(normalizeFacilityOsmRef(h.ref)),
    ).map((h) =>
        turf.point([h.lng, h.lat], { osmRef: h.ref, name: h.name }),
    );
}

function osmElementToRef(el: { type?: string; id?: number }): string {
    const t = String(el.type ?? "").toLowerCase();
    if (
        (t !== "node" && t !== "way" && t !== "relation") ||
        typeof el.id !== "number"
    ) {
        return "";
    }
    return `${t}/${el.id}`;
}

export function normalizeFacilityOsmRef(ref: string): string {
    return ref.trim().toLowerCase();
}

function labelFromOsmFacilityElement(x: {
    tags?: Record<string, string | undefined>;
}): string {
    const tags = x.tags ?? {};
    const raw =
        (typeof tags.name === "string" && tags.name) ||
        (typeof tags["name:en"] === "string" && tags["name:en"]) ||
        osmElementToRef(x as { type?: string; id?: number });
    return String(raw || "?").trim();
}

export function osmElementsToFacilityPoints(elements: any[]): Feature<Point>[] {
    const out: Feature<Point>[] = [];
    for (const x of elements) {
        const ref = osmElementToRef(x);
        if (!ref) continue;
        const lng = x.center ? x.center.lon : x.lon;
        const lat = x.center ? x.center.lat : x.lat;
        if (typeof lng !== "number" || typeof lat !== "number") continue;
        const name = labelFromOsmFacilityElement(x);
        out.push(turf.point([lng, lat], { osmRef: ref, name }));
    }
    return out;
}

export function filterFacilityPointsByDisabledOsmRefs(
    points: Feature<Point>[],
    disabledRefs: readonly string[] | undefined,
): Feature<Point>[] {
    const disabled = new Set(
        (disabledRefs ?? []).map(normalizeFacilityOsmRef).filter(Boolean),
    );
    if (disabled.size === 0) return points;
    return points.filter((p) => {
        const ref = normalizeFacilityOsmRef(
            String((p.properties as { osmRef?: string })?.osmRef ?? ""),
        );
        return ref.length > 0 && !disabled.has(ref);
    });
}

export async function fetchFullFacilityElements(
    location: APILocations,
    loadingText: string,
): Promise<{ elements: any[]; remark?: string }> {
    const data = await findPlacesInZone(
        `[${LOCATION_FIRST_TAG[location]}=${location}]`,
        loadingText,
        "nwr",
        "center",
        [],
        60,
        true, // skipPlayableTerritoryFilter — Voronoi cells extend beyond the
              // POI centroid; a facility just outside remaining territory may
              // still define the nearest catchment for territory inside the mask.
    );
    return { elements: data.elements ?? [], remark: data.remark };
}

export function validateFullFacilityFetch(
    elements: any[],
    remark: string | undefined,
    location: APILocations,
): elements is any[] {
    const label = prettifyLocation(location, true).toLowerCase();
    if (remark?.startsWith("runtime error")) {
        toast.error(
            `Error finding ${label}. Please enable hiding zone mode and switch to the Large Game variation of this question.`,
        );
        return false;
    }
    if (elements.length >= 1000) {
        toast.error(
            `Too many ${label} found (${elements.length}). Please enable hiding zone mode and switch to the Large Game variation of this question.`,
        );
        return false;
    }
    return true;
}

export function supportsOrdinaryFacilityOsmPicks(type: string): boolean {
    return type === "major-city" || type === "city" || type.endsWith("-full");
}

export function isNycStaticFacilityType(type: string): boolean {
    return type === "hospital-nyc-full";
}

/** Unfiltered OSM facility points for UI lists (major-city / city and *-full). */
export async function listOrdinaryFacilityVoronoiCandidates(q: {
    type: string;
    disabledFacilityOsmRefs?: string[];
}): Promise<Feature<Point>[]> {
    if (q.type === "hospital-nyc-full") {
        return nycHospitalPoints(q.disabledFacilityOsmRefs);
    }
    if (q.type === "major-city" || q.type === "city") {
        const data = await findPlacesInZone(
            OVERPASS_MAJOR_CITY_FILTER,
            "Finding cities...",
            "nwr",
            "center",
            [],
            0,
            true, // skipPlayableTerritoryFilter — same Voronoi reason as facilities
        );
        return osmElementsToFacilityPoints(data.elements ?? []);
    }
    if (q.type.endsWith("-full")) {
        const location = q.type.split("-full")[0] as APILocations;
        const { elements, remark } = await fetchFullFacilityElements(
            location,
            `Finding ${prettifyLocation(location, true).toLowerCase()}...`,
        );
        if (!validateFullFacilityFetch(elements, remark, location)) return [];
        return osmElementsToFacilityPoints(elements);
    }
    return [];
}
