// Shim for the legacy global-only Leaflet.draw UMD build, which has *no* module
// exports (`module.exports` count is 0 — it only attaches `L.Draw` to the
// global Leaflet). react-leaflet-draw still does `import Draw from "leaflet-draw"`;
// under Vite 8 / rolldown that hard-fails with MISSING_EXPORT instead of
// synthesizing an empty default the way the old commonjs plugin did.
//
// astro.config.mjs aliases the bare `leaflet-draw` specifier to this file. We
// run the side-effectful build (the full dist path does NOT match the alias, so
// no recursion) and re-expose the attached `L.Draw` as the default export.
//
// Import leaflet FIRST: leaflet.draw.js references a free global `L`, so the
// global Leaflet namespace must exist before it runs. Leaflet's UMD build
// (dist/leaflet-src.js) sets `globalThis.L` when evaluated, and ESM evaluates
// these imports in source order — so we don't rely on react-leaflet happening
// to be imported earlier elsewhere.
import "leaflet";
import "leaflet-draw/dist/leaflet.draw.js";

export default (globalThis.L && globalThis.L.Draw) || {};
