const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const base64UrlPattern = /^[A-Za-z0-9_-]*$/;

export function bytesToBase64Url(bytes: Uint8Array): string {
    let output = "";

    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index];
        const second = bytes[index + 1] ?? 0;
        const third = bytes[index + 2] ?? 0;
        const chunk = (first << 16) | (second << 8) | third;

        output += alphabet[(chunk >> 18) & 63];
        output += alphabet[(chunk >> 12) & 63];
        output += index + 1 < bytes.length ? alphabet[(chunk >> 6) & 63] : "=";
        output += index + 2 < bytes.length ? alphabet[chunk & 63] : "=";
    }

    return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
    if (!base64UrlPattern.test(value)) {
        throw new Error("Invalid base64url payload.");
    }

    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const paddingLength = (4 - (padded.length % 4)) % 4;
    const base64 = padded + "=".repeat(paddingLength);
    const bytes: number[] = [];

    for (let index = 0; index < base64.length; index += 4) {
        const chars = base64.slice(index, index + 4);
        const first = alphabet.indexOf(chars[0]);
        const second = alphabet.indexOf(chars[1]);
        const third = chars[2] === "=" ? 0 : alphabet.indexOf(chars[2]);
        const fourth = chars[3] === "=" ? 0 : alphabet.indexOf(chars[3]);

        if (first < 0 || second < 0 || third < 0 || fourth < 0) {
            throw new Error("Invalid base64url payload.");
        }

        const chunk = (first << 18) | (second << 12) | (third << 6) | fourth;
        bytes.push((chunk >> 16) & 255);
        if (chars[2] !== "=") bytes.push((chunk >> 8) & 255);
        if (chars[3] !== "=") bytes.push(chunk & 255);
    }

    return Uint8Array.from(bytes);
}
