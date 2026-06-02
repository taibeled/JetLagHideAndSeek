/// <reference lib="webworker" />
// Service worker for offline app-shell + runtime caching of third-party
// map/geocoding hosts.
//
// Build pipeline: `src/sw.ts` is bundled by esbuild + has its precache
// manifest injected by `@serwist/build` from a small Astro integration
// in `astro.config.mjs`. Output lands at `dist/client/sw.js`, served at
// `<base>sw.js`. See the integration's docblock for the full why.
//
// Caching strategy summary:
//   * App shell (HTML/JS/CSS/fonts/images shipped with the build) —
//     precached via `self.__SW_MANIFEST`. This is what makes the site
//     boot offline.
//   * Map tiles (Carto, OSM, Thunderforest) — StaleWhileRevalidate so
//     previously-viewed tiles keep rendering offline, with aggressive
//     expiration caps so we don't blow out storage.
//   * Geocoders + boundary APIs (Photon, Nominatim) — SWR for offline
//     reuse. Overpass is network-only (see runtime route) so production
//     SW matches localhost behavior and avoids no-response failures.
//   * Same-origin API routes (/api/**) — NetworkFirst with a short
//     timeout so the live server's responses always win when online
//     but cached responses keep the UI alive when offline.
//
// Notes:
//   * `skipWaiting: false` is deliberate — clients dispatch SKIP_WAITING
//     from the update-available toast instead, so users keep control
//     over reloads while a game is in progress. See `src/lib/sw-register.ts`.

import {
    CacheableResponsePlugin,
    CacheFirst,
    ExpirationPlugin,
    NetworkFirst,
    NetworkOnly,
    type PrecacheEntry,
    Serwist,
    type SerwistGlobalConfig,
    StaleWhileRevalidate,
} from "serwist";

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        // Injected at build time by @serwist/vite. Holds the list of
        // precached URLs + revision hashes for the app shell.
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: false,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
        {
            // Carto basemaps (light_all / dark_all / voyager).
            matcher: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/i,
            handler: new StaleWhileRevalidate({
                cacheName: "tiles-cartocdn",
                plugins: [
                    new CacheableResponsePlugin({ statuses: [0, 200] }),
                    new ExpirationPlugin({
                        maxEntries: 2000,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
                        maxAgeFrom: "last-used",
                    }),
                ],
            }),
        },
        {
            // Standard OSM tile server.
            matcher: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: new StaleWhileRevalidate({
                cacheName: "tiles-osm",
                plugins: [
                    new CacheableResponsePlugin({ statuses: [0, 200] }),
                    new ExpirationPlugin({
                        maxEntries: 1500,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
                        maxAgeFrom: "last-used",
                    }),
                ],
            }),
        },
        {
            // Thunderforest (Transport / Neighbourhood styles). API-keyed
            // but the key travels in the query string, so the URL is still
            // cacheable — different keys naturally get different cache
            // entries.
            matcher: /^https:\/\/tile\.thunderforest\.com\/.*/i,
            handler: new StaleWhileRevalidate({
                cacheName: "tiles-thunderforest",
                plugins: [
                    new CacheableResponsePlugin({ statuses: [0, 200] }),
                    new ExpirationPlugin({
                        maxEntries: 1000,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
                        maxAgeFrom: "last-used",
                    }),
                ],
            }),
        },
        {
            // Photon geocoder — direct in dev, proxied in prod via /api/proxy-api.
            matcher: ({ url }: { url: URL }) =>
                url.hostname === "photon.komoot.io" ||
                (url.pathname === "/api/proxy-api" &&
                    (url.searchParams.get("url") ?? "").includes(
                        "photon.komoot.io",
                    )),
            handler: new StaleWhileRevalidate({
                cacheName: "geocoder-photon",
                plugins: [
                    new CacheableResponsePlugin({ statuses: [0, 200] }),
                    new ExpirationPlugin({
                        maxEntries: 200,
                        maxAgeSeconds: 7 * 24 * 60 * 60,
                        maxAgeFrom: "last-used",
                    }),
                ],
            }),
        },
        {
            // Nominatim — boundary polygons + reverse geocoding. Cache
            // aggressively because boundaries are the expensive thing we
            // want to survive a reload. Matches both direct and proxied URLs.
            matcher: ({ url }: { url: URL }) =>
                url.hostname === "nominatim.openstreetmap.org" ||
                (url.pathname === "/api/proxy-api" &&
                    (url.searchParams.get("url") ?? "").includes(
                        "nominatim.openstreetmap.org",
                    )),
            handler: new StaleWhileRevalidate({
                cacheName: "boundaries-nominatim",
                plugins: [
                    new CacheableResponsePlugin({ statuses: [0, 200] }),
                    new ExpirationPlugin({
                        maxEntries: 200,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
                        maxAgeFrom: "last-used",
                    }),
                ],
            }),
        },
        {
            // Overpass — network-only (see comment below). Matches both
            // direct domain (dev) and /api/proxy-api (prod).
            matcher: ({ url }: { url: URL }) =>
                /^(overpass-api\.de|overpass\.kumi\.systems|overpass\.private\.coffee)$/.test(
                    url.hostname,
                ) ||
                (url.pathname === "/api/proxy-api" &&
                    /overpass/.test(url.searchParams.get("url") ?? "")),
            method: "GET" as const,
            handler: new NetworkOnly(),
        },
        {
            // Leaflet marker sprites, Leaflet-Draw assets, and similar
            // third-party assets loaded from unpkg / jsdelivr. CacheFirst
            // because these are versioned URLs — they either change path
            // on upgrade or don't change at all.
            matcher: /^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net)\/.*/i,
            handler: new CacheFirst({
                cacheName: "vendor-assets",
                plugins: [
                    new CacheableResponsePlugin({ statuses: [0, 200] }),
                    new ExpirationPlugin({
                        maxEntries: 40,
                        maxAgeSeconds: 365 * 24 * 60 * 60,
                        maxAgeFrom: "last-used",
                    }),
                ],
            }),
        },
        {
            // Same-origin API routes (on Railway these are live node
            // endpoints; on GH Pages they 404 and the client falls back
            // to the public CORS proxy). NetworkFirst with a short
            // timeout means we try the server first but don't hang if
            // the user is offline.
            matcher: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith("/api/"),
            handler: new NetworkFirst({
                cacheName: "api",
                networkTimeoutSeconds: 10,
                plugins: [
                    new CacheableResponsePlugin({ statuses: [0, 200] }),
                    new ExpirationPlugin({
                        maxEntries: 50,
                        maxAgeSeconds: 24 * 60 * 60,
                        maxAgeFrom: "last-used",
                    }),
                ],
            }),
        },
    ],
});

serwist.addEventListeners();
