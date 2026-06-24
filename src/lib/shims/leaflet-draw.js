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
// Pin `globalThis.L` to the imported leaflet FIRST (see leaflet-global.js):
// leaflet.draw.js references a free global `L`, and it must extend the SAME
// leaflet instance the app imports — otherwise `L.drawLocal` is undefined and
// PolygonDraw crashes. This MUST be a separate module imported before the
// plugin: ES import side effects run before statement code, so setting the
// global inline here would be too late.
import "./leaflet-global.js";
import "leaflet-draw/dist/leaflet.draw.js";

export default (globalThis.L && globalThis.L.Draw) || {};
