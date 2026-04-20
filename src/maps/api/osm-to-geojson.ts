/**
 * Adapter for OSM JSON → GeoJSON conversion.
 *
 * Current: osmtogeojson (stable, browser-compatible)
 *
 * To migrate to osm2geojson-ultra once the upstream issues are resolved,
 * replace the two lines below with:
 *
 *   import { osm2geojson } from "osm2geojson-ultra";
 *   export default osm2geojson;
 *
 * Blocked by two issues in osm2geojson-ultra:
 *   1. `xml.js` imports `txml` at the top level (not lazily), pulling in `through2`
 *      which depends on Node.js `util`/`events`/`buffer`. Vite 7's ESM module runner
 *      fails on these CJS builtins even with polyfill plugins.
 *      Fix: lazy-import `txml` only in the XML parsing path
 *      (e.g. `const { parse } = await import("txml/txml")`).
 *   2. Returns empty FeatureCollection for Overpass `out geom` responses with real
 *      multipolygon relations (inlined `geometry: [{lat,lon}]` arrays on members).
 *      osmtogeojson handles this correctly.
 *      Fix: handle inlined member geometry in the JSON parsing path.
 *
 * Tracking issue: https://github.com/dschep/osm2geojson-ultra/issues/NEW
 */

import osmtogeojson from "osmtogeojson";

export default osmtogeojson;
