const DEFAULT_APP_LINK_BASE_URL = "https://jetlag.hinoka.org";

export const CUSTOM_SCHEME = "jetlag-hide-seek-v2";
export const IMPORT_PATH = "/i/";

export function buildHttpsImportUrl(payload: string): string {
    const baseUrl = DEFAULT_APP_LINK_BASE_URL.replace(/\/+$/, "");
    return `${baseUrl}${IMPORT_PATH}?d=${payload}`;
}

export function buildCustomSchemeImportUrl(payload: string): string {
    return `${CUSTOM_SCHEME}://import?d=${payload}`;
}
