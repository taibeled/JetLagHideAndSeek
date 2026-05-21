import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("share site verification files", () => {
    it("includes the iOS bundle id in the Apple app site association file", () => {
        const file = readFileSync(
            join(process.cwd(), "site/.well-known/apple-app-site-association"),
            "utf8",
        );
        const parsed = JSON.parse(file);

        expect(parsed.applinks.details[0].appIDs).toContain(
            "TEAMID.com.raycatdev.hideandseek.v2",
        );
        expect(parsed.applinks.details[0].paths).toEqual(["/i/*", "/i"]);
    });

    it("includes the Android package in assetlinks.json", () => {
        const file = readFileSync(
            join(process.cwd(), "site/.well-known/assetlinks.json"),
            "utf8",
        );
        const parsed = JSON.parse(file);

        expect(parsed[0].target.package_name).toBe(
            "com.raycatdev.hideandseek.v2",
        );
        expect(parsed[0].target.sha256_cert_fingerprints).toEqual([]);
    });
});
