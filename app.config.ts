function envValue(name: string, fallback: string) {
    const value = process.env[name]?.trim();
    return value ? value : fallback;
}

const appLinkDomain = envValue(
    "EXPO_PUBLIC_APP_LINK_DOMAIN",
    "jetlag.hinoka.org",
);

export default ({ config }) => ({
    ...config,
    extra: {
        ...config.extra,
        appLinkBaseUrl: `https://${appLinkDomain}`,
    },
    ios: {
        ...config.ios,
        associatedDomains: [`applinks:${appLinkDomain}`],
    },
    android: {
        ...config.android,
        intentFilters: [
            {
                action: "VIEW",
                autoVerify: true,
                category: ["BROWSABLE", "DEFAULT"],
                data: [
                    {
                        host: appLinkDomain,
                        pathPrefix: "/i",
                        scheme: "https",
                    },
                ],
            },
        ],
    },
});
