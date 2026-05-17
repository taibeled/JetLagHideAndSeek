export type ImportLinkError =
    | { code: "missing-payload" }
    | { code: "invalid-base64url" }
    | { code: "inflate-failed" }
    | { code: "invalid-json" }
    | { code: "schema-invalid"; details?: string }
    | { code: "unsupported-version"; version: number };

export function getImportErrorMessage(error: ImportLinkError): string {
    switch (error.code) {
        case "missing-payload":
            return "This share link is missing its setup payload.";
        case "invalid-base64url":
        case "inflate-failed":
        case "invalid-json":
            return "This share link could not be decoded.";
        case "schema-invalid":
            return "This share link does not match a supported setup format.";
        case "unsupported-version":
            return `This share link uses unsupported version ${error.version}.`;
    }
}
