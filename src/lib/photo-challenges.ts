/**
 * Photo challenge definitions for the "Photo" question category.
 *
 * Each challenge has:
 *  - `id`: machine identifier, also used as i18n key suffix (photoType.*, photoRules.*)
 *  - `sizes`: game sizes that include this challenge (S/M/L)
 */

export interface PhotoChallenge {
    /** Unique identifier — also the i18n key suffix for photoType.* and photoRules.* */
    id: string;
    /** Game sizes this challenge is available in */
    sizes: ("S" | "M" | "L")[];
}

export const PHOTO_CHALLENGES: PhotoChallenge[] = [
    // ── ALL GAMES (S, M, L) ──────────────────────────────────────────────────
    { id: "tree",                     sizes: ["S", "M", "L"] },
    { id: "sky",                      sizes: ["S", "M", "L"] },
    { id: "selfie",                   sizes: ["S", "M", "L"] },
    { id: "widest-street",            sizes: ["S", "M", "L"] },
    { id: "tallest-structure",        sizes: ["S", "M", "L"] },
    { id: "building-from-station",    sizes: ["S", "M", "L"] },

    // ── ADD FOR MEDIUM & LARGE (M, L) ────────────────────────────────────────
    { id: "tallest-building-station", sizes: ["M", "L"] },
    { id: "trace-street",            sizes: ["M", "L"] },
    { id: "two-buildings",           sizes: ["M", "L"] },
    { id: "restaurant-interior",     sizes: ["M", "L"] },
    { id: "train-platform",          sizes: ["M", "L"] },
    { id: "park",                    sizes: ["M", "L"] },
    { id: "grocery-aisle",           sizes: ["M", "L"] },
    { id: "place-of-worship",        sizes: ["M", "L"] },

    // ── ADD FOR LARGE (L) ────────────────────────────────────────────────────
    { id: "1km-streets",              sizes: ["L"] },
    { id: "tallest-mountain-station", sizes: ["L"] },
    { id: "biggest-water",            sizes: ["L"] },
    { id: "five-buildings",           sizes: ["L"] },
];
