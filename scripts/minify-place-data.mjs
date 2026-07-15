// Minifies public/singapore.json -> public/singapore.min.json.
// The readable file is the editable source; the app loads the minified one.
// Strips whitespace and rounds coordinates to 5 decimals (~1 m).
import { readFileSync, statSync, writeFileSync } from "node:fs";

const SRC = "public/singapore.json";
const OUT = "public/singapore.min.json";

const round = (n) => Math.round(n * 1e5) / 1e5;
const roundCoords = (c) =>
    typeof c[0] === "number" ? c.map(round) : c.map(roundCoords);

const data = JSON.parse(readFileSync(SRC, "utf8"));
for (const feature of data.features) {
    if (feature.geometry?.coordinates) {
        feature.geometry.coordinates = roundCoords(feature.geometry.coordinates);
    }
}
writeFileSync(OUT, JSON.stringify(data));

const mb = (p) => (statSync(p).size / 1048576).toFixed(2);
console.log(`${SRC} (${mb(SRC)}MB) -> ${OUT} (${mb(OUT)}MB)`);
