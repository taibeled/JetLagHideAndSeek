import { bytesToBase64Url } from "@/lib/base64url";
import { TEAM_ID_REGEX } from "@/lib/wire";

const PROBE_TIMEOUT_MS = 4000;

export { TEAM_ID_REGEX };

export function normalizeCasBaseUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

export async function computeSidFromCanonicalUtf8(
    canonicalUtf8: string,
): Promise<string> {
    const enc = new TextEncoder().encode(canonicalUtf8);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    return bytesToBase64Url(new Uint8Array(digest).slice(0, 16));
}

/** 128-bit nonce, base64url ~22 chars; satisfies TEAM_ID_REGEX length. */
export function newTeamId(): string {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return bytesToBase64Url(buf);
}

export async function probeHealth(baseUrl: string): Promise<boolean> {
    const root = normalizeCasBaseUrl(baseUrl);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
        const res = await fetch(`${root}/api/cas/health`, {
            method: "GET",
            signal: ctrl.signal,
        });
        return res.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(t);
    }
}

export async function putBlob(
    serverBaseUrl: string,
    compressedBase64UrlPayload: string,
    sid: string,
): Promise<void> {
    const root = normalizeCasBaseUrl(serverBaseUrl);
    const res = await fetch(`${root}/api/cas/blobs/${encodeURIComponent(sid)}`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: compressedBase64UrlPayload,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `PUT blob failed: ${res.status}`);
    }
}

export async function getBlob(
    serverBaseUrl: string,
    sid: string,
): Promise<string> {
    const root = normalizeCasBaseUrl(serverBaseUrl);
    const res = await fetch(
        `${root}/api/cas/blobs/${encodeURIComponent(sid)}`,
        { method: "GET" },
    );
    if (!res.ok) {
        throw new Error(`GET blob failed: ${res.status}`);
    }
    return res.text();
}

export async function appendTeamSnapshot(
    serverBaseUrl: string,
    teamId: string,
    sid: string,
): Promise<void> {
    if (!TEAM_ID_REGEX.test(teamId)) {
        throw new Error("Invalid team id");
    }
    const root = normalizeCasBaseUrl(serverBaseUrl);
    const res = await fetch(
        `${root}/api/teams/${encodeURIComponent(teamId)}/snapshots`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sid }),
        },
    );
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `POST team snapshot failed: ${res.status}`);
    }
}

export async function listTeamSnapshots(
    serverBaseUrl: string,
    teamId: string,
): Promise<{ sid: string; ts: number }[]> {
    if (!TEAM_ID_REGEX.test(teamId)) {
        throw new Error("Invalid team id");
    }
    const root = normalizeCasBaseUrl(serverBaseUrl);
    const res = await fetch(
        `${root}/api/teams/${encodeURIComponent(teamId)}/snapshots`,
        { method: "GET" },
    );
    if (!res.ok) {
        throw new Error(`GET team snapshots failed: ${res.status}`);
    }
    const data = (await res.json()) as {
        snapshots?: { sid: string; ts: number }[];
    };
    return data.snapshots ?? [];
}

