# Agent Guide

## Project Shape

- This is an Astro static PWA with React islands, Tailwind, Leaflet, Nanostores, Turf, and a small Fastify CAS server.
- The public app is served under the Astro base path `/JetLagHideAndSeek/`. Keep this aligned with `CAS_STATIC_PREFIX` in the server stack.
- Frontend source lives in `src/`; server source lives in `server/src/`.
- Shared game state is persisted mostly through Nanostores in `src/lib/context.ts`, encoded/decoded through `src/lib/wire.ts`, and loaded from shared payloads in `src/lib/loadHidingZone.ts`.
- Question behavior is split by type under `src/maps/questions/`; shared geometry helpers live under `src/maps/geo-utils/`.
- Do not hand-edit `dist/` or `server/dist/`; they are build output.

## Common Commands

Use `pnpm`.

```bash
pnpm test
pnpm --dir server test
pnpm build
pnpm build:all
pnpm start:stack
pnpm start:app
pnpm lint
```

Notes:

- `pnpm start:app` builds the frontend and server, then serves both the PWA and CAS API on port `8787`.
- `pnpm start:stack` expects `pnpm build:all` to have already produced `dist/` and `server/dist/`.
- `pnpm lint` runs ESLint with `--fix` on `src` (not `tests/`) and then Prettier over the repo, so expect formatting changes.
- Root `package.json` declares Node `<25`; server declares Node `>=18`.

## Running Locally

Production-style single-origin app:

```bash
pnpm install
pnpm --dir server install
pnpm start:app
```

Open:

```text
http://localhost:8787/JetLagHideAndSeek/
```

Dev split setup:

```bash
pnpm dev
pnpm --dir server dev
```

Then configure the app's Options -> Game state server URL if CAS is not same-origin.

## Architecture Notes

- `src/pages/index.astro` wires together the two sidebars, top place picker, map, options drawer, and tutorial dialog.
- `src/components/Map.tsx` owns the Leaflet map, tile layers, right-click context menu, draw controls, print control, geolocation follow mode, and question refresh pipeline.
- `src/components/QuestionSidebar.tsx` and `src/components/cards/*` render/edit question cards.
- `src/components/ZoneSidebar.tsx` handles hiding-zone/station discovery controls.
- `src/components/OptionDrawers.tsx` handles sharing, CAS discovery, `?sid=`, team sync, local storage stats, and app options.
- `src/components/TutorialDialog.tsx` provides an interactive walkthrough of all features and question types.
- `src/components/DraggableMarkers.tsx` renders draggable station markers on the map (uses remote CDN marker icons, not local assets).
- `src/components/PlacePicker.tsx` is the top-of-page geocoder for centering the map.
- `src/components/LatLngPicker.tsx` lets users pick custom coordinate points.
- `src/components/PolygonDraw.tsx` wraps Leaflet draw for creating custom polygons.
- `src/components/PoiCandidatesLayer.tsx` renders POI markers (museums, parks, etc.) on the map.
- `src/lib/context.ts` is the central state registry. Many stores are persistent atoms backed by `localStorage`.
- `src/lib/liveSync.ts` uploads canonical wire snapshots to CAS. It deliberately waits until all questions are locked unless forced by Share.
- `src/lib/cas.ts` and `src/lib/casDiscovery.ts` handle CAS client operations and SID-based URL discovery.
- `src/lib/nearestPoi.ts` provides POI name resolution and distance formatting helpers.
- `src/lib/playAreaModes.ts` defines play area behavioral modes.
- `server/src/app.ts` exposes `/api/cas/*`, `/api/teams/*`, and optionally serves the built Astro app. See [server/README.md](server/README.md).

## State And Sharing

- Legacy URL/state formats include `hz`, `hzc`, and `pb`; current CAS sharing uses `sid`.
- Wire v1 snapshots are deterministic JSON with sorted keys; SID is derived from the canonical UTF-8 payload.
- `drag === true` on question data means the question is unlocked/editable. Several flows intentionally avoid final sync while any question is unlocked.
- When hydrating from a shared URL, uploads are suppressed with `setHydrating(true)` to avoid immediately overwriting the incoming state.
- Hiding-zone payloads can contain questions, custom stations, disabled stations, presets, radius settings, station discovery options, and team metadata. Preserve passthrough fields unless you are intentionally changing the wire format.

## Geometry And Map Gotchas

- Leaflet uses `[lat, lng]`; GeoJSON and Turf use `[lng, lat]`. Check coordinate order before changing geometry code.
- `src/maps/index.ts` applies questions sequentially. In planning mode, unlocked questions produce planning polygons and are skipped for elimination.
- `sanitizeGeoJSONForLeaflet` exists because Leaflet can choke on some valid GeoJSON shapes. Use existing sanitizers/helpers before adding ad hoc geometry fixes.
- Some map data comes from browser/network APIs: geocoding, Overpass, map tiles, ArcGIS/Turf transforms, and station discovery. Tests should avoid depending on live network unless explicitly designed for it.
- `public/coastline50.geojson` (~3.9 MB) is used for coastline distance elimination. It is the largest tracked file in the repo.
- The PWA service worker is configured to use `NetworkOnly` for CAS/team API routes. Keep API routes out of precache/offline behavior.

## Code Style

- Prefer the existing `@/` import alias over relative imports from `src`; ESLint enforces this.
- Keep imports sorted; `simple-import-sort` is enabled.
- React is configured for the automatic JSX runtime; do not add `import React`.
- Existing code tolerates `any` in places. Do not do broad type refactors unless that is the task.
- Use existing UI primitives under `src/components/ui/` and existing map/question helpers before adding new abstractions.
- Keep comments sparse and useful; many complex areas already rely on short explanatory comments.

## Testing Guidance

- Frontend/unit tests: `pnpm test`.
- Server tests: `pnpm --dir server test`.
- For focused work, run the nearest test file directly with Vitest, for example:

```bash
pnpm vitest tests/wire.test.ts
pnpm vitest src/maps/questions/matching.test.ts
pnpm --dir server vitest run tests/blobs.test.ts
```

- Add or update tests when changing wire compatibility, CAS validation, persistence recovery, station manipulation, or geometry operators.
- For browser checks, use the running app URL and verify at least load, map controls, Options, sharing/CAS state, and the relevant question UI.

## Known UI Checkpoints

When the app is running with the bundled CAS server, a healthy load should show:

- Page title: `Map Generator for Jet Lag The Game: Hide and Seek`.
- Main map with Leaflet zoom/draw/print controls.
- Left Questions sidebar with question cards and an Add Question action.
- Right Hiding Zone sidebar with station discovery controls.
- Options drawer with local storage stats, CAS status, session copy/paste, and team workspace controls.

The current UI may emit a Radix warning about missing dialog description/`aria-describedby`; treat it as an accessibility cleanup item, not a fatal runtime error.
