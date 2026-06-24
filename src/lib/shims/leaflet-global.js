// The legacy leaflet-draw UMD plugin extends a free global `L` (adds `L.Draw`,
// `L.drawLocal`, `L.Control.Draw`, …). The app reads those back off its own
// `import * as L from "leaflet"`, so the plugin MUST extend that exact object.
//
// The old shim relied on leaflet's own `expose()` (which does `window.L = L`)
// to make the global line up with the module import. Under the Serwist service
// worker's chunk serving, that global can diverge from the bundled module
// instance — `leaflet.draw.js` then extends one object while the app reads a
// different one, leaving `L.drawLocal` undefined and crashing PolygonDraw on
// `L.drawLocal.draw` ("Cannot read properties of undefined (reading 'draw')").
//
// Pin the global to the imported leaflet explicitly so there's exactly one
// instance. This lives in its OWN module, imported first by the leaflet-draw
// shim: ES import side effects run before any statement code in the importing
// module, so an assignment placed between the two imports there would execute
// too late.
import * as leaflet from "leaflet";

// For leaflet's CJS build, `default` is the mutable module.exports object the
// app's named imports (`L.Draw`, `L.drawLocal`) are live bindings to; fall back
// to the namespace if a future ESM build has no default.
globalThis.L = leaflet.default ?? leaflet;
