/**
 * Three-tier fetch helper for GTFS zip imports.
 *
 * GTFS feeds are served by transit agencies whose CORS policies vary widely.
 * Rather than baking in one strategy, we try in order:
 *
 *   1. Direct fetch — works for feeds that send `Access-Control-Allow-Origin`
 *      (MTA subway, LIRR, Metro-North, SLE as of last check).
 *   2. Self-hosted proxy — only exists when the app is deployed with an Astro
 *      SSR adapter (Railway/Vercel/etc). Configured via
 *      `PUBLIC_GTFS_PROXY_URL`; if unset, skipped.
 *   3. Public proxy (corsproxy.io) — best-effort; rate-limited, occasionally
 *      down, but ships zero infrastructure.
 *
 * Returns the raw bytes plus which method succeeded, so callers can record
 * the import method on the system record for later refreshes.
 */

/**
 * Public CORS proxy. Corsproxy.io passes through headers and supports large
 * responses. If it disappears, swap this constant.
 */
const PUBLIC_PROXY = "https://corsproxy.io/?url=";

// Default to our own proxy endpoint — it always exists on SSR deploys
// (Railway, Vercel, etc). If the app is served as a fully static build and
// /api/proxy-gtfs returns 404, the catch below will fall through to tier 3.
// Set PUBLIC_GTFS_PROXY_URL to override (e.g. a separate microservice).
const SELF_HOSTED_PROXY =
    (import.meta as any).env?.PUBLIC_GTFS_PROXY_URL || "/api/proxy-gtfs";

export type FetchMethod = "direct" | "self-hosted" | "public-proxy";

export interface FetchResult {
    bytes: ArrayBuffer;
    method: FetchMethod;
    contentType: string;
}

class GtfsFetchError extends Error {
    constructor(
        message: string,
        public readonly attempts: Array<{
            method: FetchMethod;
            reason: string;
        }>,
    ) {
        super(message);
        this.name = "GtfsFetchError";
    }
}

/**
 * Fetch a GTFS zip with the full fallback ladder. `onProgress` reports
 * downloaded-bytes progress (total may be null when the server omits
 * Content-Length, which is common behind proxies).
 */
export async function fetchGtfsZip(
    url: string,
    onProgress?: (loaded: number, total: number | null) => void,
    signal?: AbortSignal,
): Promise<FetchResult> {
    const attempts: Array<{ method: FetchMethod; reason: string }> = [];

    // Tier 1: direct
    try {
        const bytes = await downloadWithProgress(url, onProgress, signal);
        return {
            bytes: bytes.buffer,
            method: "direct",
            contentType: bytes.contentType,
        };
    } catch (err) {
        attempts.push({
            method: "direct",
            reason: err instanceof Error ? err.message : String(err),
        });
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // Tier 2: self-hosted proxy (if configured)
    if (SELF_HOSTED_PROXY) {
        try {
            const proxyUrl = `${SELF_HOSTED_PROXY}?url=${encodeURIComponent(url)}`;
            const bytes = await downloadWithProgress(
                proxyUrl,
                onProgress,
                signal,
            );
            return {
                bytes: bytes.buffer,
                method: "self-hosted",
                contentType: bytes.contentType,
            };
        } catch (err) {
            attempts.push({
                method: "self-hosted",
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // Tier 3: public proxy
    try {
        const proxyUrl = `${PUBLIC_PROXY}${encodeURIComponent(url)}`;
        const bytes = await downloadWithProgress(proxyUrl, onProgress, signal);
        return {
            bytes: bytes.buffer,
            method: "public-proxy",
            contentType: bytes.contentType,
        };
    } catch (err) {
        attempts.push({
            method: "public-proxy",
            reason: err instanceof Error ? err.message : String(err),
        });
    }

    throw new GtfsFetchError(
        `All fetch methods failed for ${url}. Upload the zip file instead.`,
        attempts,
    );
}

interface DownloadedBytes {
    buffer: ArrayBuffer;
    contentType: string;
}

/**
 * Fetch with streaming progress. Falls back to non-streaming if the response
 * body isn't a readable stream (old browsers, some polyfilled proxies).
 */
async function downloadWithProgress(
    url: string,
    onProgress?: (loaded: number, total: number | null) => void,
    signal?: AbortSignal,
): Promise<DownloadedBytes> {
    const res = await fetch(url, { signal });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    const contentLength = res.headers.get("content-length");
    const total = contentLength ? parseInt(contentLength, 10) : null;

    if (!res.body || !("getReader" in res.body)) {
        const buf = await res.arrayBuffer();
        onProgress?.(buf.byteLength, buf.byteLength);
        return { buffer: buf, contentType };
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            loaded += value.byteLength;
            onProgress?.(loaded, total);
        }
    }

    // Concatenate. Using a single buffer avoids multiple reallocations.
    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { buffer: result.buffer, contentType };
}

/**
 * Validate that a fetched blob really is a GTFS zip (or at least looks like
 * a zip — full GTFS validation happens during parsing). Catches the "proxy
 * returned an HTML error page" failure mode early so we surface a useful
 * error instead of a cryptic unzip failure.
 */
export function looksLikeZip(bytes: ArrayBuffer): boolean {
    if (bytes.byteLength < 4) return false;
    const view = new Uint8Array(bytes, 0, 4);
    // Zip local file header: 0x50 0x4B 0x03 0x04 ("PK\x03\x04")
    return (
        view[0] === 0x50 &&
        view[1] === 0x4b &&
        view[2] === 0x03 &&
        view[3] === 0x04
    );
}
