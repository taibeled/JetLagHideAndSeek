/**
 * Nanostores atoms for the multiplayer session state.
 * These live alongside the existing context.ts atoms.
 */
import { persistentAtom } from "@nanostores/persistent";
import type {
    MapLocation,
    ParticipantWithToken,
    Role,
    Session,
    SessionQuestion,
} from "@hideandseek/shared";
import { atom } from "nanostores";
import { clearCache } from "@/maps/api/cache";
import { CacheType } from "@/maps/api/types";
// Static import from context.ts is safe: context.ts does not import
// session-context.ts, so there is no circular dependency.
// Moving to a static import ensures leaveSession() resets ALL map state
// SYNCHRONOUSLY (before the next render), preventing stale zone data from
// bleeding into a subsequent HiderAreaSearch session.
import {
    additionalMapGeoLocations,
    hiderMode,
    isLoading,
    mapGeoJSON,
    mapGeoLocation,
    questionModified,
    questions,
} from "@/lib/context";

// ── Persisted (survive page reload) ──────────────────────────────────────────

/** The participant's own token + metadata, stored in localStorage */
export const sessionParticipant = persistentAtom<ParticipantWithToken | null>(
    "session_participant",
    null,
    { encode: JSON.stringify, decode: JSON.parse },
);

/** Session code the user is currently in */
export const sessionCode = persistentAtom<string | null>(
    "session_code",
    null,
    { encode: JSON.stringify, decode: JSON.parse },
);

/** Spielgröße, die der Nutzer beim Onboarding gewählt hat (S/M/L). */
export const gameSize = persistentAtom<"S" | "M" | "L" | null>(
    "game_size",
    null,
    { encode: JSON.stringify, decode: JSON.parse },
);

// ── In-memory ─────────────────────────────────────────────────────────────────

/** Full session object (refreshed from server or synced via WS) */
export const currentSession = atom<Session | null>(null);

/**
 * Role chosen in the onboarding screen before a session is created/joined.
 * Cleared when the session starts or the user navigates back to role selection.
 */
export const pendingRole = atom<"hider" | "seeker" | null>(null);

/**
 * True once the hider has confirmed the play area in HiderAreaSearch.
 * Cleared when leaving the session or navigating back.
 */
export const hiderAreaConfirmed = atom<boolean>(false);

/** All questions in the current session */
export const sessionQuestions = atom<SessionQuestion[]>([]);

/** Connection status of the WebSocket */
export const wsStatus = atom<"disconnected" | "connecting" | "connected">(
    "disconnected",
);

/** Number of seekers connected to the session (from WS sync) */
export const seekerCount = atom<number>(0);

/** Whether the hider is connected */
export const hiderConnected = atom<boolean>(false);

/**
 * Key of the locally-staged (draft) question that the seeker has configured
 * but not yet sent to the hider.  Stored as an atom (not React state) so that
 * it survives the sidebar Sheet unmounting on mobile when the user closes the
 * panel to inspect the map.
 */
export const pendingDraftKey = atom<number | null>(null);

/**
 * Active GPS-tracking session for a Thermometer question.
 * Non-null while the seeker is driving from point A toward point B.
 * Lives outside the sidebar so it survives the sidebar Sheet unmounting.
 */
export type ThermometerGpsTrackingState = {
    /** Key of the draft question in questions_atom */
    questionKey: number;
    /** Target distance in kilometres (always km internally) */
    targetKm: number;
    /** GPS start position = point A */
    startLat: number;
    startLng: number;
    /** Current GPS position = live candidate for point B */
    currentLat: number;
    currentLng: number;
    /** Distance traveled from A so far (km) */
    traveled: number;
    /** Timestamp (ms) of the last significant movement (> 5 m) */
    lastMoveTime: number;
    /** Latest GPS accuracy in metres, null = unknown */
    accuracy: number | null;
    /** True when watchPosition has not delivered a fix recently */
    signalLost: boolean;
};

export const thermometerGpsTracking = atom<ThermometerGpsTrackingState | null>(null);

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getRole(): Role | null {
    return sessionParticipant.get()?.role ?? null;
}

export function getToken(): string | null {
    return sessionParticipant.get()?.token ?? null;
}

export function isInSession(): boolean {
    return sessionCode.get() !== null && sessionParticipant.get() !== null;
}

export function leaveSession(): void {
    // ── Session state ──────────────────────────────────────────────────────
    sessionParticipant.set(null);
    sessionCode.set(null);
    currentSession.set(null);
    sessionQuestions.set([]);
    wsStatus.set("disconnected");
    seekerCount.set(0);
    hiderConnected.set(false);
    pendingRole.set(null);
    hiderAreaConfirmed.set(false);
    pendingDraftKey.set(null);
    thermometerGpsTracking.set(null);
    gameSize.set(null);

    // ── Map cache – fully clear all session-specific cached data ──────────
    clearCache(CacheType.CACHE);
    clearCache(CacheType.ZONE_CACHE);

    // ── Map state – reset everything that was set by the session ──────────
    // All resets are synchronous so that any subsequent render (e.g. the
    // user immediately clicking "Ich bin Hider" after leaving) sees clean
    // state and HiderAreaSearch starts with no stale zones.

    // Remove all session questions from the local map
    questions.set([]);
    questionModified();

    // Clear the computed map overlay
    mapGeoJSON.set(null);

    // Clear additional zones selected by the hider
    additionalMapGeoLocations.set([]);

    // Deactivate hider GPS mode
    hiderMode.set(false);

    // Reset map to the default location (Germany).
    mapGeoLocation.set({
        geometry: {
            coordinates: [51.1657, 10.4515],
            type: "Point",
        },
        type: "Feature",
        properties: {
            osm_type: "R",
            osm_id: 51477,
            extent: [55.0581, 5.8663, 47.2701, 15.0419],
            country: "Germany",
            osm_key: "place",
            countrycode: "DE",
            osm_value: "country",
            name: "Germany",
            type: "country",
        },
    } as any);
}

/** Upsert a question in the local list (add or update in place) */
export function upsertSessionQuestion(question: SessionQuestion): void {
    const current = sessionQuestions.get();
    const idx = current.findIndex((q) => q.id === question.id);
    if (idx === -1) {
        sessionQuestions.set([...current, question]);
    } else {
        const updated = [...current];
        updated[idx] = question;
        sessionQuestions.set(updated);
    }
}

/**
 * Apply a MapLocation received from the server into the local mapGeoLocation
 * atom so the map boundary updates immediately.
 */
export function applyServerMapLocation(location: MapLocation): void {
    if (!location.osmFeature) return;

    // Clear the cached boundary so the map re-fetches with the new zones.
    mapGeoJSON.set(null);

    // Always reset isLoading so the upcoming mapGeoLocation.set() triggers
    // refreshQuestions immediately, even when the zone osm_id hasn't changed
    // (e.g. seeker rejoins the same area, or WS sync fires for an unchanged zone).
    // Any in-flight Overpass fetch is safely discarded by the race-condition guard
    // inside refreshQuestions (it compares currentOsmId vs osmIdAtStart).
    isLoading.set(false);

    // Restore additional zones saved by the hider; clear if none present
    // so the seeker doesn't inherit stale areas from their own localStorage.
    if (location.additionalOsmFeatures?.length) {
        additionalMapGeoLocations.set(
            location.additionalOsmFeatures.map((x: any) => ({
                added: x.added ?? true,
                location: x.location,
                base: false,
            })),
        );
    } else {
        additionalMapGeoLocations.set([]);
    }

    // Set primary zone last so the mapGeoLocation change triggers
    // refreshQuestions after additionals are already in place.
    mapGeoLocation.set(location.osmFeature as any);
}

/**
 * Read the current mapGeoLocation atom and build a MapLocation object
 * suitable for storing in the backend session.
 * The osmFeature field carries the full Feature so the seeker's map can
 * render the exact same boundary as the hider.
 */
export function buildMapLocationFromContext(): MapLocation | null {
    const feature = mapGeoLocation.get();
    if (!feature) return null;

    // OSM Feature coordinates are [lng, lat]
    const coords = (feature as any)?.geometry?.coordinates as
        | [number, number]
        | undefined;
    const lat = coords ? coords[1] : 0;
    const lng = coords ? coords[0] : 0;
    const name: string =
        (feature as any)?.properties?.name ??
        (feature as any)?.properties?.display_name ??
        "";

    const additionals = additionalMapGeoLocations.get();
    return {
        lat,
        lng,
        name,
        osmFeature: feature,
        // Persist additional zones so the seeker receives the full multi-zone setup.
        additionalOsmFeatures:
            additionals.length > 0
                ? additionals.map((x) => ({ location: x.location, added: x.added }))
                : undefined,
    };
}
