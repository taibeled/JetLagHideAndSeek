/**
 * overpassFetch — resilient Overpass API fetcher with automatic fallback.
 *
 * Tries each endpoint in OVERPASS_ENDPOINTS in order.  If a request fails
 * (network error, non-200 status, or timeout), the next endpoint is attempted.
 * Returns the parsed JSON of the first successful response.
 *
 * Timeout per attempt defaults to 25 s — enough for complex queries but not so
 * long that the user stares at a spinner forever.
 */

import { OVERPASS_ENDPOINTS } from "./constants";

export interface OverpassFetchOptions {
    /** Per-endpoint timeout in milliseconds (default: 25 000). */
    timeoutMs?: number;
    /** An external AbortSignal — if aborted, all attempts stop immediately. */
    signal?: AbortSignal;
}

/**
 * Fetch an Overpass query with automatic endpoint fallback.
 *
 * @param query  The raw Overpass QL query string (NOT URL-encoded).
 * @param opts   Optional timeout and abort signal.
 * @returns      Parsed JSON response from Overpass.
 * @throws       If all endpoints fail or the external signal is aborted.
 */
export async function overpassFetch(
    query: string,
    opts: OverpassFetchOptions = {},
): Promise<any> {
    const { timeoutMs = 25_000, signal: externalSignal } = opts;

    let lastError: unknown;

    for (const endpoint of OVERPASS_ENDPOINTS) {
        // Bail immediately if caller already aborted
        if (externalSignal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }

        const controller = new AbortController();

        // Link external signal → internal abort
        const onExternalAbort = () => controller.abort();
        externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

        // Per-attempt timeout
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const url = `${endpoint}?data=${encodeURIComponent(query)}`;
            const resp = await fetch(url, { signal: controller.signal });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status} from ${endpoint}`);
            }

            const data = await resp.json();
            return data;
        } catch (err: any) {
            lastError = err;

            // If the *external* signal caused the abort, don't try further
            if (externalSignal?.aborted) {
                throw err;
            }

            // Otherwise this endpoint failed — try next
            console.warn(
                `[overpassFetch] ${endpoint} failed:`,
                err?.message ?? err,
            );
        } finally {
            clearTimeout(timer);
            externalSignal?.removeEventListener("abort", onExternalAbort);
        }
    }

    throw lastError ?? new Error("All Overpass endpoints failed");
}
