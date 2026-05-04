export function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function base64UrlToBytes(base64UrlString: string): Uint8Array {
  const regularBase64 = base64UrlString
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const paddedBase64 =
    regularBase64 + "=".repeat((4 - (regularBase64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(paddedBase64, "base64"));
}
