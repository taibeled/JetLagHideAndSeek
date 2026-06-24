// @ts-check
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import node from "@astrojs/node";
import partytown from "@astrojs/partytown";
import react from "@astrojs/react";
import { injectManifest } from "@serwist/build";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { build as esbuild } from "esbuild";

/** Project root (directory containing this file). */
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

// Defensive env var cleanup — Railway's UI occasionally sneaks an extra `=`
// into values (e.g. KEY==value), and users often forget the scheme on URLs.
// Strip blanks and leading `=` from anything we touch here.
/** @param {string | undefined | null} v */
const cleanEnv = (v) => {
    if (v == null) return undefined;
    const trimmed = String(v).trim().replace(/^=+/, "").trim();
    return trimmed.length ? trimmed : undefined;
};

// Railway sets RAILWAY_PUBLIC_DOMAIN automatically on deploy. Use it to
// auto-pick sensible defaults so no env vars need to be configured by hand.
const railwayDomain = cleanEnv(process.env.RAILWAY_PUBLIC_DOMAIN);
const isRailway =
    !!railwayDomain || !!cleanEnv(process.env.RAILWAY_ENVIRONMENT);

// Base path: GH Pages needs "/JetLagHideAndSeek", Railway serves at root.
// Astro 6 requires a leading slash, so force one on whatever the user gave us.
let base =
    cleanEnv(process.env.PUBLIC_BASE_PATH) ??
    (isRailway ? "/" : "/JetLagHideAndSeek");
if (!base.startsWith("/")) base = `/${base}`;

// Site URL: used for absolute links, sitemap, manifest, etc. Astro validates
// this with `new URL()`, so a bare domain like "foo.railway.app" would throw
// "Invalid URL". Auto-prepend https:// if the user forgot the scheme.
let site =
    cleanEnv(process.env.PUBLIC_SITE_URL) ??
    (railwayDomain ? `https://${railwayDomain}` : "https://taibeled.github.io");
if (!/^https?:\/\//i.test(site)) site = `https://${site}`;

// Opt out of the service worker during local `astro dev` by default —
// a stale SW caching half-built assets is the #1 source of "why didn't
// my change show up" confusion. Opt in with PUBLIC_ENABLE_SW=1 when
// you specifically need to test offline behavior locally.
const disableSw =
    process.env.NODE_ENV === "development" &&
    !cleanEnv(process.env.PUBLIC_ENABLE_SW);

/**
 * Hand-rolled Astro integration that builds the service worker.
 *
 * Why this instead of `@serwist/astro` or `@serwist/vite` as a plugin?
 *
 *   - `@serwist/astro` (v10 preview): the secondary `vite.build()`
 *     inherits Astro's rollup config and the SW output ends up hashed
 *     under `_astro/`, with the precache manifest never injected.
 *   - `@serwist/vite` (v9.5.7 stable): its build plugin gates work on
 *     `!ctx.viteConfig.build.ssr`, but under `@astrojs/node` adapter
 *     EVERY Astro build has `ssr=true` — even the client one — so the
 *     plugin never runs.
 *
 * So we do it ourselves, in two steps, after Astro's full build has
 * settled its files into `dist/client/`:
 *
 *   1. Bundle `src/sw.ts` (with its ES imports from `serwist`) into a
 *      single-file ESM using esbuild, writing the output directly to
 *      `dist/client/sw.js`. `self.__SW_MANIFEST` survives the bundle
 *      because esbuild leaves unknown globals alone.
 *   2. Call `@serwist/build`'s `injectManifest` in-place on that same
 *      file (swSrc === swDest). It scans `dist/client/**` for the
 *      precache manifest and replaces the `self.__SW_MANIFEST` token
 *      with the generated JSON. The "same-src-and-dest" guard in
 *      `@serwist/build` only fires when the injection point is
 *      missing, which only happens if we accidentally point it at a
 *      previously-injected file — not our case here.
 *
 * @param {{ disable: boolean }} opts
 * @returns {import("astro").AstroIntegration}
 */
const serwistIntegration = ({ disable }) => ({
    name: "serwist-injectmanifest",
    hooks: {
        "astro:build:done": async ({ logger }) => {
            if (disable) {
                logger.info("skipped (disabled)");
                return;
            }
            const clientDir = fileURLToPath(
                new URL("./dist/client", import.meta.url),
            );
            const swSrc = fileURLToPath(
                new URL("./src/sw.ts", import.meta.url),
            );
            const swOut = `${clientDir}/sw.js`;

            // esbuild walks up from the entry file looking for a
            // `.pnp.cjs` and auto-switches to Yarn PnP resolution if
            // it finds one. A stray PnP manifest from an unrelated
            // project in the user's home dir will then hijack bare
            // specifier resolution and fail with "not listed as a
            // dependency". This tiny plugin short-circuits that: for
            // any bare import we resolve through Node from this
            // project's root, which always finds our pnpm-installed
            // `node_modules/`.
            const require = createRequire(import.meta.url);
            /** @type {import("esbuild").Plugin} */
            const forceNodeResolve = {
                name: "force-node-resolve",
                setup(build) {
                    build.onResolve({ filter: /^[^./]/ }, (args) => {
                        if (args.kind === "entry-point") return null;
                        try {
                            const resolved = require.resolve(args.path, {
                                paths: [projectRoot],
                            });
                            return { path: resolved };
                        } catch {
                            return null;
                        }
                    });
                },
            };

            await esbuild({
                entryPoints: [swSrc],
                bundle: true,
                format: "esm",
                target: "es2020",
                platform: "browser",
                outfile: swOut,
                minify: true,
                // Don't leave a sourcemap comment — it references a
                // file we'd have to also emit, and the SW's code is
                // not something we debug via devtools in prod.
                sourcemap: false,
                logLevel: "warning",
                plugins: [forceNodeResolve],
            });

            const { count, size } = await injectManifest({
                swSrc: swOut,
                swDest: swOut,
                globDirectory: clientDir,
                globPatterns: [
                    "**/*.{html,js,css,svg,png,ico,woff2,webmanifest,json}",
                ],
                globIgnores: [
                    // Don't precache the SW itself or its source map.
                    "**/sw.js",
                    "**/*.map",
                    // Astro's Node adapter writes a localstorage session
                    // file under the prerender dir — not relevant to
                    // offline SW and not even in client/, but be safe.
                    "**/sessions/**",
                ],
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
                injectionPoint: "self.__SW_MANIFEST",
                // `_astro/<hash>.<ext>` filenames are already
                // content-hashed by Astro, so cache-busting them again
                // with a ?__WB_REVISION__ query-string is pointless
                // noise that also fragments the cache across reloads.
                dontCacheBustURLsMatching: /^_astro\//,
            });

            logger.info(
                `generated sw.js with ${count} precache entries (${(size / 1024).toFixed(1)} KiB)`,
            );
        },
    },
});

// https://astro.build/config
export default defineConfig({
    security: {
        // Astro's default checkOrigin:true rejects form-encoded POSTs with
        // "Cross-site POST form submissions are forbidden". Our Overpass proxy
        // (/api/proxy-api) POSTs `application/x-www-form-urlencoded` bodies,
        // and behind Railway's reverse proxy the internal host doesn't match
        // the browser Origin, so even same-origin POSTs get blocked. This app
        // has no auth, cookies, or state-changing endpoints — only stateless
        // read proxies — so CSRF origin checking provides no protection and
        // only breaks the proxy. Disable it.
        //
        // NOTE: only safe while EVERY route is a stateless read. If you ever
        // add cookies/auth or a state-changing endpoint, re-enable checkOrigin
        // (Astro has no per-route bypass) or add explicit CSRF protection to
        // that route. The proxy's real risk is SSRF, handled in proxy-api.ts
        // (host allowlist + protocol check + size cap).
        checkOrigin: false,
    },
    integrations: [
        react(),
        partytown({
            config: {
                forward: ["dataLayer.push"],
            },
        }),
        serwistIntegration({ disable: disableSw }),
    ],
    devToolbar: {
        enabled: false,
    },
    // Tailwind v4 via its Vite plugin (not the PostCSS plugin): under Vite 8 /
    // rolldown, Vite's @import resolver tries to resolve the bare `tailwindcss`
    // specifier in globals.css as a file before @tailwindcss/postcss can
    // intercept it, breaking the build. The Vite plugin handles the CSS first.
    vite: {
        plugins: [tailwindcss()],
        // The legacy leaflet-draw UMD build exports nothing, but
        // react-leaflet-draw does `import Draw from "leaflet-draw"`. Under
        // Vite 8 / rolldown that hard-fails with MISSING_EXPORT, so redirect the
        // bare specifier to a shim that runs the side-effect and re-exports
        // L.Draw as the default. (The shim's own `leaflet-draw/dist/...` import
        // is a subpath and doesn't match this exact-match alias — no recursion.)
        resolve: {
            alias: [
                {
                    find: /^leaflet-draw$/,
                    replacement: fileURLToPath(
                        new URL(
                            "./src/lib/shims/leaflet-draw.js",
                            import.meta.url,
                        ),
                    ),
                },
            ],
        },
    },
    site,
    base,
    // Astro 6: output defaults to "static". Pages are prerendered at build
    // time; API routes with `export const prerender = false` run on the
    // server via the configured adapter. On GH Pages (no adapter running),
    // those routes simply won't exist and the client falls back to the
    // public CORS proxy. On Railway the node adapter serves them.
    adapter: node({
        mode: "standalone",
    }),
});
