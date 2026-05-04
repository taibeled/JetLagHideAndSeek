import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import { base64UrlToBytes, bytesToBase64Url } from "@/lib/base64url";
import {
    PASTEBIN_API_POST_URL,
    PASTEBIN_API_RAW_URL,
    PASTEBIN_API_RAW_URL_PROXIED,
} from "@/maps/api/constants";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const mapToObj = <T, K extends string, V>(
    arr: T[],
    fn: (item: T) => [K, V],
) => Object.fromEntries(arr.map(fn));

export const compress = async (
    str: string,
    encoding = "deflate" as CompressionFormat,
): Promise<string> => {
    const byteArray = new TextEncoder().encode(str);
    const cs = new CompressionStream(encoding);
    const writer = cs.writable.getWriter();
    writer.write(byteArray);
    writer.close();
    const arrayBuffer = await new Response(cs.readable).arrayBuffer();
    return bytesToBase64Url(new Uint8Array(arrayBuffer));
};

export const decompress = async (
    base64String: string,
    encoding = "deflate" as CompressionFormat,
): Promise<string> => {
    const bytes = base64UrlToBytes(base64String);
    const cs = new DecompressionStream(encoding);
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const arrayBuffer = await new Response(cs.readable).arrayBuffer();
    return new TextDecoder().decode(arrayBuffer);
};

export async function uploadToPastebin(
    apiKey: string,
    data: string,
): Promise<string> {
    const formData = new FormData();
    formData.append("api_option", "paste");
    formData.append("api_dev_key", apiKey);
    formData.append("api_paste_code", data);
    formData.append("api_paste_private", "1"); // 1 for unlisted
    formData.append("api_paste_expire_date", "N"); // N for never

    const response = await fetch(PASTEBIN_API_POST_URL, {
        method: "POST",
        body: formData,
    });

    const responseText = await response.text();
    if (!response.ok || responseText.startsWith("Bad API request,")) {
        throw new Error("Pastebin API error: " + responseText);
    }

    return responseText;
}

export async function fetchFromPastebin(pasteId: string): Promise<string> {
    let response;
    try {
        // prefer querying Pastebin directly since CORS proxy is unreliable
        response = await fetch(PASTEBIN_API_RAW_URL + pasteId);
    } catch {
        // CORS error; happens if the paste is not owned by a Pastebin Pro user
        response = await fetch(PASTEBIN_API_RAW_URL_PROXIED + pasteId);
    }

    if (!response.ok) {
        throw new Error(
            "Failed to fetch from Pastebin: " + response.statusText,
        );
    }

    return response.text();
}

/**
 * Open native share sheet or fallback to sending to clipboard
 * @param url URL to share
 * @param forceClipboard Whether to force usage of the clipboard (instead of share sheet)
 * @returns `true` for native success, `false` for both native and fallback failure and `"clipboard"` for clipboard success
 */
export async function shareOrFallback(
    url: string,
    forceClipboard = false,
): Promise<boolean | "clipboard"> {
    if (forceClipboard) {
        if (!navigator || !navigator.clipboard) {
            // Clipboard not supported
            return false;
        }

        navigator.clipboard.writeText(url);
        return "clipboard";
    }

    if (!navigator.share) return shareOrFallback(url, true); // Fallback to clipboard

    return await navigator
        .share({ url })
        .then(() => true)
        .catch(() => {
            // Try again with clipboard
            return shareOrFallback(url, true);
        });
}
