This app is best understood as a static Astro shell with React islands sitting on top of a shared Nanostores model. It is not a formal MVC app, but it has a pretty clear MVC-ish shape once you follow the mapping flow.

**High Level**
[src/pages/index.astro](/Users/ryantseng/projects/JetLagHideAndSeek/src/pages/index.astro:1) is the composition root. It lays out:

- left sidebar: `QuestionSidebar`
- right sidebar: `ZoneSidebar`
- top place picker: `PlacePicker`
- central Leaflet map: `Map`
- options/share/team controls: `OptionDrawers`
- tutorial dialog

Astro provides the page and hydration boundaries; React owns the interactive app.

**Model**
The main model layer is [src/lib/context.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/lib/context.ts:1). This file is the central state registry.

Important mapping stores:

- `mapGeoLocation`: selected OSM place, defaulting to Japan.
- `additionalMapGeoLocations`: extra selected places.
- `mapGeoJSON`: current resolved playable area geometry in GeoJSON.
- `polyGeoJSON`: persisted custom drawn polygon, if the user drew one.
- `questions`: list of question objects.
- `questionFinishedMapData`: final computed map mask after applying questions.
- `leafletMapContext`: the live Leaflet `Map` instance.
- `trainStations`, `hidingZoneData`, `transitGraph`: station/hiding-zone runtime data.
- `hidingZone`: computed shareable snapshot of play area, questions, station settings, presets, overlays, team data, etc.

Question data is typed and normalized by Zod in [src/maps/schema.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/maps/schema.ts:1). The supported question families are:

- `radius`
- `thermometer`
- `tentacles`
- `matching`
- `measuring`

A key detail: `question.data.drag === true` means “unlocked/editable.” Locked questions are applied to elimination; unlocked questions may instead render planning polygons when planning mode is on.

**Domain / Geometry Layer**
The actual map math lives under `src/maps/`.

The central dispatcher is [src/maps/index.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/maps/index.ts:1):

- `applyQuestionsToMapGeoData(...)` applies questions sequentially.
- `adjustMapGeoDataForQuestion(...)` dispatches by question id.
- `determinePlanningPolygon(...)` creates preview/planning geometry for unlocked questions.
- `hiderifyQuestion(...)` can rewrite editable questions based on hider mode.

Each question type has its own geometry module:

- [src/maps/questions/radius.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/maps/questions/radius.ts:1)
- [src/maps/questions/thermometer.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/maps/questions/thermometer.ts:1)
- [src/maps/questions/tentacles.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/maps/questions/tentacles.ts:1)
- [src/maps/questions/matching.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/maps/questions/matching.ts:1)
- [src/maps/questions/measuring.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/maps/questions/measuring.ts:1)

Shared low-level geometry helpers are in `src/maps/geo-utils/`. This is where Turf/GeoJSON helpers, sanitization, unions, Voronoi/station work, transit graph helpers, and coordinate utilities live.

A recurring gotcha: Leaflet works in `[lat, lng]`, while GeoJSON/Turf use `[lng, lat]`. The app has helpers like `convertToLongLat` / `convertToLatLong` in [src/maps/api/geo.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/maps/api/geo.ts:1), but many components still need to be very explicit about coordinate order.

**View**
The main visual map view is [src/components/Map.tsx](/Users/ryantseng/projects/JetLagHideAndSeek/src/components/Map.tsx:1).

It renders:

- `MapContainer`
- base tile layer
- POI candidate layer
- draggable question markers
- custom polygon draw controls
- scale / print / fullscreen controls
- Leaflet context menu for adding questions at clicked coordinates

`Map.tsx` is also where the computed geometry becomes Leaflet layers. Its `refreshQuestions()` function is the heart of the map rendering pipeline:

1. Read current `questions`.
2. Resolve base play area:
    - use `mapGeoJSON` if already available,
    - else use `polyGeoJSON`,
    - else call `determineMapBoundaries()` from `src/maps/api`.
3. Optionally “hiderify” editable questions.
4. Remove old question/elimination layers from Leaflet.
5. Call `applyQuestionsToMapGeoData(...)`.
6. Render planning polygons, if any.
7. Convert remaining valid hiding area into a holed mask.
8. Sanitize GeoJSON for Leaflet.
9. Add the final elimination layer to the Leaflet map.
10. Store the result in `questionFinishedMapData`.
11. Auto-zoom if enabled.

So `Map.tsx` is both a view and a controller bridge. The pure-ish map logic lives in `src/maps`, but the effectful Leaflet integration lives here.

**Controllers**
The controller layer is spread across React components. They mutate Nanostores, and those store updates cause map/sidebar effects to recompute.

Main examples:

- [src/components/PlacePicker.tsx](/Users/ryantseng/projects/JetLagHideAndSeek/src/components/PlacePicker.tsx:1): geocodes places, updates `mapGeoLocation` / `additionalMapGeoLocations`, clears cached geometry.
- [src/components/QuestionSidebar.tsx](/Users/ryantseng/projects/JetLagHideAndSeek/src/components/QuestionSidebar.tsx:1): renders question cards and add/delete controls.
- `src/components/cards/*`: edit question-specific data.
- [src/components/DraggableMarkers.tsx](/Users/ryantseng/projects/JetLagHideAndSeek/src/components/DraggableMarkers.tsx:1): lets users drag unlocked question points; mutates question coordinates.
- [src/components/PolygonDraw.tsx](/Users/ryantseng/projects/JetLagHideAndSeek/src/components/PolygonDraw.tsx:1): writes custom play-area polygons or custom question geometries.
- [src/components/ZoneSidebar.tsx](/Users/ryantseng/projects/JetLagHideAndSeek/src/components/ZoneSidebar.tsx:1): computes and renders station/hiding-zone overlays based on final map data.
- [src/components/OptionDrawers.tsx](/Users/ryantseng/projects/JetLagHideAndSeek/src/components/OptionDrawers.tsx:1): sharing, CAS, live sync, hider mode, tile/options controls.

The common pattern is:

```text
User action
  -> component mutates Nanostore
  -> subscribed React islands re-render or run effects
  -> Map.tsx recomputes Leaflet layers
  -> ZoneSidebar may compute station zones from questionFinishedMapData
```

**Mapping Flow**
The most important data flow looks like this:

```text
PlacePicker / PolygonDraw
  -> mapGeoLocation, additionalMapGeoLocations, polyGeoJSON, mapGeoJSON

QuestionSidebar / cards / DraggableMarkers / context menu
  -> questions

Map.tsx
  -> determineMapBoundaries or use polyGeoJSON
  -> applyQuestionsToMapGeoData
  -> render Leaflet GeoJSON layers
  -> questionFinishedMapData

ZoneSidebar
  -> uses questionFinishedMapData
  -> fetches/normalizes stations
  -> filters station circles by playable area and special station questions
  -> renders hiding-zone overlays
```

**Sharing / Persistence**
Most model state persists through Nanostores’ `persistentAtom`, backed by `localStorage`. Sharing is built around a canonical wire snapshot:

- [src/lib/wire.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/lib/wire.ts:1) canonicalizes JSON and wraps it as wire v1.
- [src/lib/loadHidingZone.ts](/Users/ryantseng/projects/JetLagHideAndSeek/src/lib/loadHidingZone.ts:1) hydrates incoming shared state back into Nanostores.
- `OptionDrawers` handles `sid`, legacy URL params, CAS discovery, and replacement prompts.

The server is small and mostly supports CAS/team state sharing; the client is where the map game logic lives.
