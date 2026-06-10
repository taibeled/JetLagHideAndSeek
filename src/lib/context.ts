import { persistentAtom } from "@nanostores/persistent";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";
import type { Map } from "leaflet";
import { atom, computed, onSet } from "nanostores";

import { gameKey } from "@/lib/game-slot";
import { buildReachabilityPayload } from "@/lib/share/reachability-payload";
import type { ReachabilityResult } from "@/lib/transit/types";
import type {
    AdditionalMapGeoLocations,
    CustomStation,
    OpenStreetMap,
    StationCircle,
} from "@/maps/api";
import { extractStationLabel } from "@/maps/geo-utils";
import type { ReachabilityStatus } from "@/maps/geo-utils/zonePipeline";
import {
    type DeepPartial,
    type Question,
    type Questions,
    questionSchema,
    questionsSchema,
    type Units,
} from "@/maps/schema";

// Persistent atoms come in two scopes:
//   * gameKey("…")  — per-game state (regions, questions, hider mode, zone
//     options, reachability inputs…). Namespaced by the ?game= URL slot so
//     independent games can run in different tabs without clobbering each
//     other (see lib/game-slot.ts).
//   * bare "…" keys — app-level preferences (tile layer, API keys, units,
//     tutorial seen, presets library). Shared across every game on purpose;
//     a new game shouldn't reset your tile layer or replay the tutorial.
export const DEFAULT_MAP_GEO_LOCATION_OSM_ID = 382313;

export const mapGeoLocation = persistentAtom<OpenStreetMap>(
    gameKey("mapGeoLocation"),
    {
        geometry: {
            coordinates: [36.5748441, 139.2394179],
            type: "Point",
        },
        type: "Feature",
        properties: {
            osm_type: "R",
            osm_id: DEFAULT_MAP_GEO_LOCATION_OSM_ID,
            extent: [45.7112046, 122.7141754, 20.2145811, 154.205541],
            country: "Japan",
            osm_key: "place",
            countrycode: "JP",
            osm_value: "country",
            name: "Japan",
            type: "country",
        },
    },
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const additionalMapGeoLocations = persistentAtom<
    AdditionalMapGeoLocations[]
>(gameKey("additionalMapGeoLocations"), [], {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const permanentOverlay = persistentAtom<FeatureCollection | null>(
    gameKey("permanentOverlay"),
    null,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const mapGeoJSON = atom<FeatureCollection<
    Polygon | MultiPolygon
> | null>(null);
export const polyGeoJSON = persistentAtom<FeatureCollection<
    Polygon | MultiPolygon
> | null>(gameKey("polyGeoJSON"), null, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

/**
 * Tracks whether the current game-territory polygon was fetched from
 * Nominatim's pre-simplified `/lookup?polygon_geojson=1` endpoint
 * ("simple") or from Overpass's full `out geom` query ("detailed").
 *
 * The distinction matters because Nominatim polygons are ~190KB for
 * a whole country and appear in under a second, but they omit tiny
 * outlying islands and coastline detail. For games that need precise
 * coastline play the user can click "Load detailed boundary" and the
 * app swaps in the Overpass version.
 *
 * Reset to "simple" whenever the picked region changes (see onSet
 * hooks below) so the upgrade button re-appears for the new region.
 */
export const boundaryDetailLevel = atom<"simple" | "detailed">("simple");

/**
 * Bumped by code paths that need to force `Map.tsx`'s refresh effect
 * to run again without any of its other dependencies changing. The
 * detailed-boundary upgrade uses this: it sets `mapGeoJSON` directly
 * to the Overpass result, then bumps this nonce so the map re-renders
 * with the new polygon.
 */
export const mapRefreshNonce = atom(0);

/**
 * When non-null, the next map left-click will invoke this callback with the
 * clicked lat/lng, then reset the atom to null. Used by the thermometer
 * "tap to place end point" flow and the 📍 pick-on-map button in
 * LatLngPicker. Components inside MapContainer subscribe via useStore and
 * register a useMapEvents click handler that fires when this is set.
 */
export const mapPickMode = atom<((lat: number, lng: number) => void) | null>(
    null,
);

onSet(mapGeoLocation, ({ newValue }) => {
    // Picking a new region resets the upgrade state - the new
    // polygon starts life as Nominatim-simplified again. We gate on
    // osm_id actually changing so that no-op re-sets (e.g. hydration
    // from localStorage into the same value) don't wipe a just-loaded
    // detailed polygon.
    const prevId = mapGeoLocation.get()?.properties?.osm_id;
    const nextId = newValue?.properties?.osm_id;
    if (prevId !== nextId && boundaryDetailLevel.get() !== "simple") {
        boundaryDetailLevel.set("simple");
    }
});
onSet(additionalMapGeoLocations, ({ newValue }) => {
    const prevIds = additionalMapGeoLocations
        .get()
        .map((l) => l.location.properties.osm_id)
        .sort()
        .join(",");
    const nextIds = (newValue ?? [])
        .map((l) => l.location.properties.osm_id)
        .sort()
        .join(",");
    if (prevIds !== nextIds && boundaryDetailLevel.get() !== "simple") {
        boundaryDetailLevel.set("simple");
    }
});

export const questions = persistentAtom<Questions>(gameKey("questions"), [], {
    encode: JSON.stringify,
    decode: (x) => questionsSchema.parse(JSON.parse(x)),
});
export const addQuestion = (question: DeepPartial<Question>) =>
    questionModified(questions.get().push(questionSchema.parse(question)));

export const questionModified = (..._: any[]) => {
    if (autoSave.get()) {
        questions.set([...questions.get()]);
    } else {
        triggerLocalRefresh.set(Math.random());
    }
};

export const leafletMapContext = atom<Map | null>(null);

export const defaultUnit = persistentAtom<Units>("defaultUnit", "miles");
export const hiderMode = persistentAtom<
    | false
    | {
          latitude: number;
          longitude: number;
      }
>(gameKey("isHiderMode"), false, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const startingLocation = persistentAtom<
    | false
    | {
          latitude: number;
          longitude: number;
      }
>(gameKey("startingLocation"), false, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const triggerLocalRefresh = atom<number>(0);
export const displayHidingZones = persistentAtom<boolean>(
    gameKey("displayHidingZones"),
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const displayHidingZonesOptions = persistentAtom<string[]>(
    gameKey("displayHidingZonesOptions"),
    ["[railway=station]"],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const displayHidingZonesStyle = persistentAtom<
    "zones" | "stations" | "no-overlap" | "no-display"
>(gameKey("displayHidingZonesStyle"), "zones");
export const questionFinishedMapData = atom<any>(null);

/**
 * Union of the playable map territory after {@link applyQuestionsToMapGeoData}
 * (same geometry the map uses before the world “holed” mask). Used to drop
 * Overpass POIs whose centers fall outside the visible game area (e.g. EWR
 * when the territory union is NYC-only).
 */
export const playableTerritoryUnion = atom<Feature<
    Polygon | MultiPolygon
> | null>(null);

export const trainStations = atom<StationCircle[]>([]);
onSet(trainStations, ({ newValue }) => {
    newValue.sort((a, b) => {
        const aName = (extractStationLabel(a.properties) || "") as string;
        const bName = (extractStationLabel(b.properties) || "") as string;
        return aName.localeCompare(bName);
    });
});

export const useCustomStations = persistentAtom<boolean>(
    gameKey("useCustomStations"),
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const customStations = persistentAtom<CustomStation[]>(
    gameKey("customStations"),
    [],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const mergeDuplicates = persistentAtom<boolean>(
    gameKey("removeDuplicates"),
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const includeDefaultStations = persistentAtom<boolean>(
    gameKey("includeDefaultStations"),
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const activeStationsOnly = persistentAtom<boolean>(
    gameKey("activeStationsOnly"),
    true,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
// Use the app's bundled NY/NJ/CT/PA station dataset (NYC Subway, LIRR,
// Metro-North, NJ Transit, SEPTA, Amtrak, Hartford Line) instead of fetching
// railway=station from Overpass. Instant, can't time out, works offline — but
// only covers that region, so it's OFF by default and opt-in per game.
export const useBundledStations = persistentAtom<boolean>(
    gameKey("useBundledStations"),
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
// Drop stations whose parent railway way is tagged as a heritage /
// tourist / preserved / abandoned line. Off by default because the
// valid/invalid distinction is game-logic, not OSM-encodable: one-way
// tourist routes like Durango-Silverton and Cuyahoga Valley Scenic are
// fair hiding spots, while round-trip excursions like the Essex Steam
// Train are not. Flip on per-game as needed.
export const excludeHeritageRailways = persistentAtom<boolean>(
    gameKey("excludeHeritageRailways"),
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

// ---------------------------------------------------------------------------
// Reachability / GTFS filtering
//
// Transient: computed by the reachability worker on query. Not
// persisted — the Map<stopId, seconds> is large and derived from
// imported GTFS feeds, so a page reload will simply re-run the query.
// ---------------------------------------------------------------------------
export const reachabilityResult = atom<ReachabilityResult | null>(null);

// Per-OSM-id classification the last filter run produced. Transient —
// regenerated every time Phase B runs. Consumed by the sidebar station
// list + map styling to show which stations are reachable / unknown /
// unreachable, and by the override UI so the icon can reflect the
// underlying status vs. a user-forced decision.
// NOTE: `Map` is aliased to the leaflet type at the top of this file, so
// we explicitly reach for the JS built-in here.
export const reachabilityClassifications = atom<
    globalThis.Map<string, ReachabilityStatus>
>(new globalThis.Map());

// Per-OSM-station override for reachability filtering. "include"
// keeps the station even if RAPTOR says unreachable; "exclude" drops
// it regardless of reachability status. Used by the Phase 4 "Unknown
// station" UI so users can manually resolve ambiguous matches.
export const reachabilityOverrides = persistentAtom<
    Record<string, "include" | "exclude">
>(
    gameKey("reachabilityOverrides"),
    {},
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

// ---------------------------------------------------------------------------
// Reachability query inputs. Persisted so a game host picking "45 min
// from the hotel at 9am Saturday" doesn't have to reconfigure every
// session. The result itself is transient (`reachabilityResult` above).
// ---------------------------------------------------------------------------
export const reachabilityBudgetMinutes = persistentAtom<number>(
    gameKey("reachabilityBudgetMinutes"),
    45,
    { encode: JSON.stringify, decode: JSON.parse },
);
export const reachabilityWalkSpeedMph = persistentAtom<number>(
    gameKey("reachabilityWalkSpeedMph"),
    3,
    { encode: JSON.stringify, decode: JSON.parse },
);
export const reachabilityMaxWalkLegMinutes = persistentAtom<number>(
    gameKey("reachabilityMaxWalkLegMinutes"),
    20,
    { encode: JSON.stringify, decode: JSON.parse },
);
// Preset IDs are resolved to a concrete Date at query time by
// `resolveDeparturePreset`. "custom" uses `reachabilityDepartureCustomISO`.
export type ReachabilityDeparturePreset =
    | "now"
    | "weekday-9am"
    | "saturday-noon"
    | "tonight-6pm"
    | "custom";
export const reachabilityDeparturePreset =
    persistentAtom<ReachabilityDeparturePreset>(
        gameKey("reachabilityDeparturePreset"),
        "now",
        { encode: JSON.stringify, decode: JSON.parse },
    );
export const reachabilityDepartureCustomISO = persistentAtom<string>(
    gameKey("reachabilityDepartureCustomISO"),
    "",
);
// Empty array means "use all imported systems" — matches the RAPTOR
// worker's own default and avoids a chicken-and-egg problem where the
// user has nothing selected on a fresh install.
export const reachabilitySelectedSystemIds = persistentAtom<string[]>(
    gameKey("reachabilitySelectedSystemIds"),
    [],
    { encode: JSON.stringify, decode: JSON.parse },
);

export const animateMapMovements = persistentAtom<boolean>(
    "animateMapMovements",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const hidingRadius = persistentAtom<number>(gameKey("hidingRadius"), 0.5, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const hidingRadiusUnits = persistentAtom<Units>(
    gameKey("hidingRadiusUnits"),
    "miles",
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const disabledStations = persistentAtom<string[]>(
    gameKey("disabledStations"),
    [],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const autoSave = persistentAtom<boolean>("autoSave", true, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const save = () => {
    questions.set([...questions.get()]);
    const $hiderMode = hiderMode.get();

    if ($hiderMode !== false) {
        hiderMode.set({ ...$hiderMode });
    }
};

/* Presets for custom questions (savable / sharable / editable) */
export type CustomPreset = {
    id: string;
    name: string;
    type: string;
    data: any;
    createdAt: string;
};

export const customPresets = persistentAtom<CustomPreset[]>(
    "customPresets",
    [],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
onSet(customPresets, ({ newValue }) => {
    newValue.sort((a, b) => a.name.localeCompare(b.name));
});

export const saveCustomPreset = (
    preset: Omit<CustomPreset, "id" | "createdAt">,
) => {
    const id =
        typeof crypto !== "undefined" &&
        typeof (crypto as any).randomUUID === "function"
            ? (crypto as any).randomUUID()
            : String(Date.now());
    const p: CustomPreset = {
        ...preset,
        id,
        createdAt: new Date().toISOString(),
    };
    customPresets.set([...customPresets.get(), p]);
    return p;
};

export const updateCustomPreset = (
    id: string,
    updates: Partial<CustomPreset>,
) => {
    customPresets.set(
        customPresets
            .get()
            .map((p) => (p.id === id ? { ...p, ...updates } : p)),
    );
};

export const deleteCustomPreset = (id: string) => {
    customPresets.set(customPresets.get().filter((p) => p.id !== id));
};

export const hidingZone = computed(
    [
        questions,
        polyGeoJSON,
        mapGeoLocation,
        additionalMapGeoLocations,
        disabledStations,
        hidingRadius,
        hidingRadiusUnits,
        displayHidingZonesOptions,
        useCustomStations,
        customStations,
        includeDefaultStations,
        customPresets,
        permanentOverlay,
        startingLocation,
        reachabilityBudgetMinutes,
        reachabilityWalkSpeedMph,
        reachabilityMaxWalkLegMinutes,
        reachabilityDeparturePreset,
        reachabilityDepartureCustomISO,
        reachabilitySelectedSystemIds,
        reachabilityOverrides,
    ],
    (
        q,
        geo,
        loc,
        altLoc,
        disabledStations,
        radius,
        hidingRadiusUnits,
        zoneOptions,
        useCustom,
        $customStations,
        includeDefault,
        presets,
        $permanentOverlay,
        $startingLocation,
        $budget,
        $walkSpeed,
        $maxWalkLeg,
        $departurePreset,
        $departureCustomISO,
        $selectedSystemIds,
        $overrides,
    ) => {
        // Build the (optional) reachability share block. Omitted entirely
        // when every field is still at its default — a sharer who has
        // never touched Phase 4 ships the exact same payload they would
        // have pre-Phase-4.
        const reachability = buildReachabilityPayload({
            budgetMinutes: $budget,
            walkSpeedMph: $walkSpeed,
            maxWalkLegMinutes: $maxWalkLeg,
            departurePreset: $departurePreset,
            departureCustomISO: $departureCustomISO,
            selectedSystemIds: $selectedSystemIds,
            overrides: $overrides,
        });

        if (geo !== null) {
            return {
                ...geo,
                questions: q,
                disabledStations: disabledStations,
                hidingRadius: radius,
                hidingRadiusUnits,
                zoneOptions: zoneOptions,
                useCustomStations: useCustom,
                customStations: $customStations,
                includeDefaultStations: includeDefault,
                presets: structuredClone(presets),
                permanentOverlay: $permanentOverlay,
                startingLocation: $startingLocation,
                ...(reachability ? { reachability } : {}),
            };
        } else {
            const $loc = structuredClone(loc);
            $loc.properties.isHidingZone = true;
            $loc.properties.questions = q;
            return {
                ...$loc,
                disabledStations: disabledStations,
                hidingRadius: radius,
                hidingRadiusUnits,
                alternateLocations: structuredClone(altLoc),
                zoneOptions: zoneOptions,
                useCustomStations: useCustom,
                customStations: $customStations,
                includeDefaultStations: includeDefault,
                presets: structuredClone(presets),
                permanentOverlay: $permanentOverlay,
                startingLocation: $startingLocation,
                ...(reachability ? { reachability } : {}),
            };
        }
    },
);

export const drawingQuestionKey = atom<number>(-1);
export const planningModeEnabled = persistentAtom<boolean>(
    gameKey("planningModeEnabled"),
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const autoZoom = persistentAtom<boolean>("autoZoom", true, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export const isLoading = atom<boolean>(false);

export const baseTileLayer = persistentAtom<
    "voyager" | "light" | "dark" | "transport" | "neighbourhood" | "osmcarto"
>("baseTileLayer", "voyager");
export const thunderforestApiKey = persistentAtom<string>(
    "thunderforestApiKey",
    "",
    {
        encode: (value: string) => value,
        decode: (value: string) => value,
    },
);
export const followMe = persistentAtom<boolean>("followMe", false, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const defaultCustomQuestions = persistentAtom<boolean>(
    "defaultCustomQuestions",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const pastebinApiKey = persistentAtom<string>("pastebinApiKey", "");
export const alwaysUsePastebin = persistentAtom<boolean>(
    "alwaysUsePastebin",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const showTutorial = persistentAtom<boolean>("showTutorials", true, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const tutorialStep = atom<number>(0);

export const customInitPreference = persistentAtom<"ask" | "blank" | "prefill">(
    "customInitPreference",
    "ask",
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const allowGooglePlusCodes = persistentAtom<boolean>(
    "allowGooglePlusCodes",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
