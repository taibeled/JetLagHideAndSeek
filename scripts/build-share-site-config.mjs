import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const siteDir = join(root, "site");
const wellKnownDir = join(siteDir, ".well-known");

function envValue(names, fallback) {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return fallback;
}

const appLinkDomain = envValue(
    ["APP_LINK_DOMAIN", "EXPO_PUBLIC_APP_LINK_DOMAIN"],
    "jetlag.hinoka.org",
);
const appleTeamId = envValue(["APPLE_TEAM_ID"], "TEAMID");
const iosBundleId = envValue(
    ["IOS_BUNDLE_IDENTIFIER"],
    "com.raycatdev.hideandseek.v2",
);
const androidPackage = envValue(
    ["ANDROID_PACKAGE_NAME"],
    "com.raycatdev.hideandseek.v2",
);
const androidFingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const aasa = {
    applinks: {
        apps: [],
        details: [
            {
                appIDs: [`${appleTeamId}.${iosBundleId}`],
                components: [
                    {
                        "/": "/i/*",
                        comment: "Open Hide & Seek Mapper import links.",
                    },
                    {
                        "/": "/i",
                        comment: "Open Hide & Seek Mapper import links.",
                    },
                ],
                paths: ["/i/*", "/i"],
            },
        ],
    },
};

const assetLinks = [
    {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
            namespace: "android_app",
            package_name: androidPackage,
            sha256_cert_fingerprints: androidFingerprints,
        },
    },
];

await mkdir(wellKnownDir, { recursive: true });
await writeFile(
    join(wellKnownDir, "apple-app-site-association"),
    `${JSON.stringify(aasa, null, 2)}\n`,
);
await writeFile(
    join(wellKnownDir, "assetlinks.json"),
    `${JSON.stringify(assetLinks, null, 2)}\n`,
);
await writeFile(join(siteDir, "CNAME"), `${appLinkDomain}\n`);

console.log(`Built share site verification files for ${appLinkDomain}`);
