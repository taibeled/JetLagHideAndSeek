import * as turf from "@turf/turf";

/**
 * Function to merge duplicates stations into one station, by averaging their longitude and latitude
 * @param places    Array of all unmerged stations
 * @param radius    Radius of the hiding zone
 * @param units     turf.Units unit of the radius ("miles", "kilometers" etc.)
 * @returns         Array of all merged stations
 */
export function mergeDuplicateStation(
    places: any[],
    radius: number,
    units: turf.Units,
): any[] {
    const grouped = new Map<string, any[]>();
    // 1. Group by name
    for (const place of places) {
        const name = place.properties.name;
        // Check if the group already exist, if not add a new group entry.
        if (!grouped.has(name)) {
            grouped.set(name, [place]);
        } else {
            // group already exist, need to check all groups and all members if their zones are shared
            let placeAdded = false;
            for (const group of grouped) {
                // check all groups
                const groupValues = group[1];

                // if the name matches the first group members name, check all members
                if (groupValues[0].properties.name == name) {
                    let shareZones: boolean = false;
                    for (const groupPlace of groupValues) {
                        const station1: Location = {
                            coordinates: place.geometry.coordinates,
                        };
                        const station2: Location = {
                            coordinates: groupPlace.geometry.coordinates,
                        };
                        shareZones = checkIfStationsShareZones(
                            station1,
                            station2,
                            radius,
                            units,
                        );
                        if (!shareZones) {
                            // new zone does not overlap with a station, leave early
                            break;
                        }
                    }
                    if (shareZones) {
                        // add to group if all stations share the zone
                        groupValues.push(place);
                        placeAdded = true;
                        break; // leave group search, as the new place is already added
                    }
                }
            }

            if (!placeAdded) {
                // if we arrive here, we need to make a new group with a unique key

                // searching for all groups containing the station name to find latest index
                const matches = Array.from(grouped.entries()).filter(
                    ([key]) => typeof key === "string" && key.includes(name),
                );
                const lastGroup = matches.at(-1); // last group has the latest index
                let lastKey = "0";
                if (lastGroup) {
                    lastKey = lastGroup[0];
                }
                const lastIdx = Number(lastKey.split("#")[1] ?? "0");
                const nextIdx = lastIdx + 1;
                const key: string = name + "#" + nextIdx.toString();
                // New key example: "Station Name#1"
                grouped.set(key, [place]);
            }
        }
    }

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
