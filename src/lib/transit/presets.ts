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
 * Curated starter set — NYC Metro area commuter rail + Connecticut
 * Shore Line East. These are the systems the original JetLag crew
 * actually travels on. Add more here (any region, any rail mode) and
 * they'll appear in the dialog automatically.
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
        // In local dev: serve from public/gtfs/nyct-subway.zip (gitignored,
        // see .gitignore). Same-origin — no CORS, no proxy needed. In
        // production: /api/proxy-gtfs handles the S3 fetch (S3 has no CORS
        // headers so direct browser fetches fail without the proxy).
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
        kind: "byo-url",
        id: "njt-rail",
        name: "NJ Transit Rail",
        agency: "New Jersey Transit",
        region: "New Jersey",
        description:
            "NJ Transit commuter rail. Covers the Northeast Corridor, North Jersey Coast, and every other NJT rail line.",
        reason: "NJ Transit's developer terms forbid hot-linking their feed — each user has to register and paste their own URL.",
        portalUrl: "https://developer.njtransit.com/registration/",
        licenseUrl: "https://developer.njtransit.com/terms/",
    },
    {
        kind: "public",
        id: "sle",
        name: "Shore Line East",
        agency: "Connecticut DOT / CTtransit",
        region: "Connecticut",
        description: "Shore Line East commuter rail (New Haven ↔ New London).",
        url: "https://www.cttransit.com/sites/default/files/gtfs/slegtfs_1.zip",
        licenseUrl: "https://www.cttransit.com/about/developers/terms-of-use",
    },
];
