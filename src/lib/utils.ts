import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import {
    PASTEBIN_API_POST_URL,
    PASTEBIN_API_RAW_URL,
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

    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
};

export const decompress = async (
    base64String: string,
    encoding = "deflate" as CompressionFormat,
): Promise<string> => {
    const regularBase64 = base64String.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 =
        regularBase64 + "=".repeat((4 - (regularBase64.length % 4)) % 4);

    const binaryString = atob(paddedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

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
    const response = await fetch(PASTEBIN_API_RAW_URL + pasteId);

    if (!response.ok) {
        throw new Error(
            "Failed to fetch from Pastebin: " + response.statusText,
        );
    }

    return response.text();
}
