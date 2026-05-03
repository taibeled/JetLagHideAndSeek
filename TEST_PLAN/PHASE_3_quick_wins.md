# Phase 3: Pure Function Quick Wins

## 9. Schema Roundtrip Tests — `src/maps/schema.ts`

**Why**: Only `matchingQuestionSchema` tested. Other schemas need parse roundtrip
to prevent wire-format regressions. Test through the **exported** `questionsSchema`
(individual type schemas like `radiusQuestionSchema` and `thermometerQuestionSchema`
are not exported). Exported: `tentacleQuestionSchema`, `matchingQuestionSchema`,
`measuringQuestionSchema`, `questionSchema`, `questionsSchema`, `determineUnionizedStrings`,
`NO_GROUP`.

**New file**: `tests/questionSchemas.test.ts`

| Schema | Minimum test |
|--------|-------------|
| Parse radius question via `questionsSchema` | `{ id: "radius", key: 0, data: { lat, lng, radius, unit, within } }` |
| Parse thermometer question via `questionsSchema` | `{ id: "thermometer", key: 0, data: { latA, lngA, latB, lngB, warmer } }` |
| Parse tentacle question via `questionsSchema` | `{ id: "tentacles", key: 0, data: { lat, lng, radius, unit, locationType, location } }` |
| Parse measuring question via `questionsSchema` | Ordinary: `{ id: "measuring", key: 0, data: { lat, lng, type: "coastline", unit } }`; Custom: `{ id: "measuring", key: 0, data: { lat, lng, type: "custom-measure", unit, geo } }` |
| `questionsSchema` parses array of mixed question types | Array with radius + matching + thermometer |
| `questionsSchema` rejects unknown `id` | `{ id: "bogus", ... }` → throws |
| Verify default values are populated when fields omitted | Parse question with minimal fields, check defaults |
| `determineUnionizedStrings` returns correct descriptions | Pass matching schema union, verify output |
| Color field defaults to a valid color when omitted | Parse question without `color`, assert color is non-empty string |

## 10. Utility Pure Functions

**New file**: `tests/utils.test.ts` for `src/lib/utils.ts`:
- `cn(...inputs)` — Tailwind className merge (truthy, falsy, conditional)
- `mapToObj(entries, fn)` — maps array to key-value object
- `normalizeCasBaseUrl(url)` — trailing slash removal only

**New file**: `src/maps/geo-utils/operators-tags.test.ts`:
- `normalizeOsmText(value)` returns a trimmed non-empty string or `undefined`; it does not lowercase
- `expandFiltersForOperatorNetwork(baseFilter, alternatives, operatorFilter)` returns `{ primaryLines, alternativeLines }`; test regex escaping indirectly by passing operator/network strings with regex metacharacters
- `escapeOverpassRegexPattern(text)` is private — test escaping behavior through `expandFiltersForOperatorNetwork`; if direct tests are desired, export it first

## 11. Station/Label Helpers — `src/maps/geo-utils/special.ts`

**New file**: `src/maps/geo-utils/special.test.ts`:
- `extractStationName(feature, "english-preferred")` → returns English name
- `extractStationName(feature, "native-preferred")` → returns native name
- `extractStationLabel(feature, strategy)` → label with name fallback
- `lngLatToText([lng, lat])` → formats coordinates with degree symbols and hemisphere suffixes
- Test fallback through `extractStationLabel(feature, strategy)` where the feature has no station names and uses `geometry.coordinates`
- `groupObjects(objects)` → groups by name:en/name/network with union-find

## 12. Server Standalone Unit Tests

**New file**: `server/tests/sid.test.ts`:
- `computeSidFromCanonicalUtf8(canonicalUtf8)` returns a stable 22-character SID for a known canonical string (uses Node's `crypto.createHash`, no mock needed)
- `computeSidFromCanonicalUtf8()` returns the same SID for identical input and different SIDs for different input
- `SID_PATTERN` matches valid 22-character base64url SIDs and rejects invalid strings

**New file**: `server/tests/decompress.test.ts`:
- `decompressDeflateBase64Url(encoded)` → roundtrip with known input
- Handles invalid base64 gracefully (returns empty, throws, or specific error)
