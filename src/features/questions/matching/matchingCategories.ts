import type { MatchingCategory } from "./matchingTypes";

export type CategorySection =
    | "Administrative Divisions"
    | "Natural"
    | "Places of Interest"
    | "Public Utilities"
    | "Transit";

export type MatchingCategoryConfig = {
    category: MatchingCategory;
    osmQueryTags: string;
    section: CategorySection;
    title: string;
};

export const matchingCategories: MatchingCategoryConfig[] = [
    // Transit
    {
        category: "transit-line",
        osmQueryTags: "",
        section: "Transit",
        title: "Transit Line",
    },
    {
        category: "station-name-length",
        osmQueryTags: "",
        section: "Transit",
        title: "Station's Name Length",
    },
    {
        category: "commercial-airport",
        osmQueryTags: `["aeroway"="aerodrome"]`,
        section: "Transit",
        title: "Commercial Airport",
    },

    // Administrative Divisions
    {
        category: "admin-1st",
        osmQueryTags: `["boundary"="administrative"]["admin_level"="4"]`,
        section: "Administrative Divisions",
        title: "1st Admin. Division",
    },
    {
        category: "admin-2nd",
        osmQueryTags: `["boundary"="administrative"]["admin_level"="7"]`,
        section: "Administrative Divisions",
        title: "2nd Admin. Division",
    },
    {
        category: "admin-3rd",
        osmQueryTags: `["boundary"="administrative"]["admin_level"="9"]`,
        section: "Administrative Divisions",
        title: "3rd Admin. Division",
    },
    {
        category: "admin-4th",
        osmQueryTags: `["boundary"="administrative"]["admin_level"="10"]`,
        section: "Administrative Divisions",
        title: "4th Admin. Division",
    },

    // Natural
    {
        category: "mountain",
        osmQueryTags: `["natural"="peak"]`,
        section: "Natural",
        title: "Mountain",
    },
    {
        category: "landmark",
        osmQueryTags: `["tourism"="attraction"]`,
        section: "Natural",
        title: "Landmark",
    },
    {
        category: "park",
        osmQueryTags: `["leisure"="park"]`,
        section: "Natural",
        title: "Park",
    },

    // Places of Interest
    {
        category: "amusement-park",
        osmQueryTags: `["tourism"="theme_park"]`,
        section: "Places of Interest",
        title: "Amusement Park",
    },
    {
        category: "zoo",
        osmQueryTags: `["tourism"="zoo"]`,
        section: "Places of Interest",
        title: "Zoo",
    },
    {
        category: "aquarium",
        osmQueryTags: `["tourism"="aquarium"]`,
        section: "Places of Interest",
        title: "Aquarium",
    },
    {
        category: "golf-course",
        osmQueryTags: `["leisure"="golf_course"]`,
        section: "Places of Interest",
        title: "Golf Course",
    },
    {
        category: "museum",
        osmQueryTags: `["tourism"="museum"]`,
        section: "Places of Interest",
        title: "Museum",
    },
    {
        category: "movie-theater",
        osmQueryTags: `["amenity"="cinema"]`,
        section: "Places of Interest",
        title: "Movie Theater",
    },

    // Public Utilities
    {
        category: "hospital",
        osmQueryTags: `["amenity"="hospital"]`,
        section: "Public Utilities",
        title: "Hospital",
    },
    {
        category: "library",
        osmQueryTags: `["amenity"="library"]`,
        section: "Public Utilities",
        title: "Library",
    },
    {
        category: "foreign-consulate",
        osmQueryTags: `["diplomatic"="consulate"]`,
        section: "Public Utilities",
        title: "Foreign Consulate",
    },
];

export const matchingCategoriesBySection = matchingCategories.reduce<
    Record<CategorySection, MatchingCategoryConfig[]>
>(
    (acc, config) => {
        const list = acc[config.section] ?? [];
        list.push(config);
        acc[config.section] = list;
        return acc;
    },
    {} as Record<CategorySection, MatchingCategoryConfig[]>,
);

export function getCategoryConfig(
    category: MatchingCategory,
): MatchingCategoryConfig | undefined {
    return matchingCategories.find((c) => c.category === category);
}

export function getCategoryTitle(category: MatchingCategory): string {
    return getCategoryConfig(category)?.title ?? category;
}

export function getCategorySection(
    category: MatchingCategory,
): CategorySection {
    return getCategoryConfig(category)?.section ?? "Natural";
}
