import * as turf from "@turf/turf";

// Function to merge duplicates stations into one station, by averaging their longitude and latitude
export function mergeDuplicateStation(places: any[]) {
    const grouped = new Map<string, any[]>();
    // 1. Group by name
    places.forEach((place) => {
        const name = place.properties.name;
        if (!grouped.has(name)) {
            grouped.set(name, []);
        }
        grouped.get(name)!.push(place);
    });

    // 2. Compute central point per group
    const merged: any[] = [];
    grouped.forEach((group) => {
        const avgLng =
            group.reduce((sum, p) => sum + p.geometry.coordinates[0], 0) /
            group.length;
        const avgLat =
            group.reduce((sum, p) => sum + p.geometry.coordinates[1], 0) /
            group.length;

        merged.push({
            ...group[0], // copy other fields from the first feature
            geometry: {
                type: "Point",
                coordinates: [avgLng, avgLat],
            },
        });
    });
    return merged;
}

// Location object definition
export type Location = {
    name?: string;
    type?: string;
    coordinates: number[]; // [longitude, latitude]
};

/**
 * Check if two stations share a zone in a way that both centers are inside the others radius.
 * Both stations must lie within the given radius of each other.
 *
 * Matches:
 *      (...{Z1..Z2)...}
 * Does not match:
 *      (....Z1....) {....Z2....}
 * @param station1 First station location.
 * @param station2 Second station location.
 * @param radius   The zone radius around each station.
 * @param units    The unit for the radius ("miles","kilometers", "meters").
 * @returns        True if both stations share a zone, otherwise false.
 */
export function checkIfStationsShareZones(
    station1: Location,
    station2: Location,
    radius: number,
    units: turf.Units,
): boolean {
    // Convert to turf points
    const point1 = turf.point([
        station1.coordinates[0],
        station1.coordinates[1],
    ]);
    const point2 = turf.point([
        station2.coordinates[0],
        station2.coordinates[1],
    ]);

    // Distance of the 2 center points
    const d = turf.distance(point1, point2, { units });

    // If the distance of the 2 center points is smaller or equal of the radius, the 2 zones overlap.
    return d <= radius;
}
