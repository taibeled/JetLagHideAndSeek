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
