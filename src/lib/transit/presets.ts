/**
 * Curated GTFS preset catalog.
 *
 * Two flavors:
 *   - `public`:  Feed URL is a stable, publicly-hosted zip. Preset
 *                card shows a single "Install" button; the URL is
 *                baked in.
 *   - `byo-url`: Feed terms require per-user credentials or
 *                redistribution constraints (e.g. NJ Transit's
 *                developer agreement). Preset card shows a URL
 *                input; the user pastes their own link before
 *                installing.
 *
 * System IDs here match what the preset will save as `TransitSystem.id`
 * in IDB, so "already installed?" checks are a simple set membership
 * test against `listSystems()`. Renaming an existing preset's id is a
 * breaking change — users will see duplicate rows after update.
 *
 * Game-day feeds (njt-rail, amtrak, septa, hartford-line) are committed
 * to public/gtfs/ and served same-origin — no CORS proxy needed, works
 * on mobile without any manual file upload.
 */

export interface PublicPreset {
    kind: "public";
    /** Stable system id used for IDB and match-preset dedup. */
    id: string;
    /** User-facing display name. */
    name: string;
    agency: string;
    region: string;
    /** Short blurb rendered under the name. */
    description: string;
    /** Direct download URL for the GTFS zip. */
    url: string;
    /** Optional attribution / license URL shown as a subtle link. */
    licenseUrl?: string;
}

export interface ByoUrlPreset {
    kind: "byo-url";
    id: string;
    name: string;
    agency: string;
    region: string;
    description: string;
    /** Human text explaining why the user needs to supply the URL. */
    reason: string;
    /** Where the user can go to get a URL. */
    portalUrl: string;
    licenseUrl?: string;
}

export type GtfsPreset = PublicPreset | ByoUrlPreset;

/**
 * Curated starter set — NYC Metro area + NJ/CT/PA for large-territory games.
 *
 * MTA feeds (subway, LIRR, MNR) are served from MTA's S3 bucket.
 * Game-day feeds (NJT, Amtrak, SEPTA, Hartford Line) are bundled in
 * public/gtfs/ so they work on mobile with a single tap — no uploads.
 */
export const GTFS_PRESETS: GtfsPreset[] = [
    {
        kind: "public",
        id: "nyct-subway",
        name: "NYC Subway",
        agency: "MTA New York City Transit",
        region: "New York",
        description:
            "Full subway system. Updated a few times per year; represents the normal schedule without most temporary changes.",
        // In local dev: serve from public/gtfs/nyct-subway.zip (gitignored).
        // In production: proxy fetches from MTA S3 (no CORS headers on S3).
        url: import.meta.env.DEV
            ? "/gtfs/nyct-subway.zip"
            : "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip",
        licenseUrl: "https://www.mta.info/developers",
    },
    {
        kind: "public",
        id: "lirr",
        name: "Long Island Rail Road",
        agency: "MTA Long Island Rail Road",
        region: "New York",
        description:
            "LIRR commuter rail. Refreshed frequently with the next ~10 days of service changes.",
        url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip",
        licenseUrl: "https://www.mta.info/developers",
    },
    {
        kind: "public",
        id: "mnr",
        name: "Metro-North Railroad",
        agency: "MTA Metro-North Railroad",
        region: "New York / Connecticut",
        description:
            "Metro-North commuter rail, incl. Hudson, Harlem, and New Haven lines.",
        url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip",
        licenseUrl: "https://www.mta.info/developers",
    },
    {
        kind: "public",
        id: "njt-rail",
        name: "NJ Transit Rail",
        agency: "New Jersey Transit",
        region: "New Jersey",
        description:
            "NJ Transit commuter rail + light rail. Northeast Corridor, North Jersey Coast, Hudson-Bergen, Newark LR, and all other NJT lines. Bus routes are filtered out automatically.",
        url: "/gtfs/njt-rail.zip",
        licenseUrl: "https://www.njtransit.com/",
    },
    {
        kind: "public",
        id: "amtrak",
        name: "Amtrak",
        agency: "Amtrak",
        region: "Northeast",
        description:
            "Amtrak intercity rail across the Northeast, including Shore Line East stops (Branford, Guilford, Madison, Clinton, Westbrook, Old Saybrook, New London).",
        url: "/gtfs/amtrak.zip",
        licenseUrl: "https://www.amtrak.com/developers",
    },
    {
        kind: "public",
        id: "septa",
        name: "SEPTA Regional Rail",
        agency: "SEPTA",
        region: "Pennsylvania",
        description:
            "SEPTA commuter rail in the Philadelphia metro area — all regional rail lines into Center City.",
        url: "/gtfs/septa-rail.zip",
        licenseUrl: "https://www.septa.org/",
    },
    {
        kind: "public",
        id: "hartford-line",
        name: "Hartford Line",
        agency: "Connecticut DOT",
        region: "Connecticut",
        description:
            "Hartford Line commuter rail (New Haven ↔ Springfield), operated by CT DOT.",
        url: "/gtfs/hartford-line.zip",
        licenseUrl: "https://www.hartfordline.com/",
    },
];

/**
 * Subset of presets to install in one tap for the NJ/NY/CT/PA large game.
 * Listed in install order — smaller feeds first so the UI feels responsive.
 */
export const LARGE_GAME_PRESET_IDS = [
    "nyct-subway",
    "hartford-line",
    "septa",
    "lirr",
    "mnr",
    "njt-rail",
    "amtrak",
] as const;
