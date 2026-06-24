/**
 * Game slots: run several independent games in one browser via the URL.
 *
 * All game state lives in persistent nanostores atoms keyed into
 * localStorage, and @nanostores/persistent live-syncs same-key atoms across
 * tabs via storage events. Without namespacing, every tab is therefore the
 * SAME game: adding a question in one tab mutates the other, and an old tab
 * left open from a previous game silently fights the current one.
 *
 * A `?game=<name>` URL param selects a storage namespace. Keys become
 * `g/<name>/<key>`; no param keeps the original unprefixed keys, so existing
 * saved games are untouched. Cross-tab sync still works WITHIN a slot (two
 * tabs on ?game=saturday share that game on purpose) while different slots
 * are fully isolated. The Cache API layers (Overpass/boundary caches) are
 * deliberately NOT namespaced — they're network caches, shared data benefits
 * every game.
 *
 * This module must be imported before any persistent atom is created (it is —
 * context.ts imports it at the top), because @nanostores/persistent fixes the
 * storage key at atom creation time.
 */

const GAME_PARAM = "game";
const MAX_SLOT_LENGTH = 40;

/**
 * Normalize a raw ?game= value into a safe slot name: lowercase, alnum plus
 * dash/underscore, length-capped. Returns null for empty/garbage input so a
 * malformed param falls back to the default (unprefixed) game rather than
 * silently creating a junk namespace.
 */
export function sanitizeGameSlot(
    raw: string | null | undefined,
): string | null {
    if (!raw) return null;
    const slot = raw
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_SLOT_LENGTH);
    return slot.length > 0 ? slot : null;
}

/** Pure resolver, exported for tests: search string → slot or null. */
export function resolveGameSlot(search: string): string | null {
    try {
        return sanitizeGameSlot(new URLSearchParams(search).get(GAME_PARAM));
    } catch {
        return null;
    }
}

/**
 * The active slot for this page load. Frozen at module init on purpose: the
 * storage keys of every persistent atom derive from it, so it cannot change
 * without a navigation anyway.
 */
export const GAME_SLOT: string | null =
    typeof location !== "undefined" ? resolveGameSlot(location.search) : null;

/** Map a logical storage key to its slot-namespaced localStorage key. */
export function gameKey(key: string): string {
    return GAME_SLOT ? `g/${GAME_SLOT}/${key}` : key;
}

// Make tabs distinguishable in the tab strip / phone app switcher: a named
// game shows its slot in the title. Microtask so the document's own <title>
// has been applied first.
if (GAME_SLOT && typeof document !== "undefined") {
    queueMicrotask(() => {
        document.title = `[${GAME_SLOT}] ${document.title}`;
    });
}

/**
 * URL that opens a brand-new, empty game slot in this same app. Slug is
 * date-based plus a short random suffix — readable in a tab title or
 * bookmark ("which game is this?") yet collision-safe.
 */
export function newGameUrl(): string {
    const d = new Date();
    const date = `${d.getMonth() + 1}-${d.getDate()}`;
    const rand = Math.random().toString(36).slice(2, 6);
    const url = new URL(location.href);
    url.searchParams.set(GAME_PARAM, `${date}-${rand}`);
    return url.toString();
}
