const pluginJs = require("@eslint/js");
const eslintConfigPrettier = require("eslint-config-prettier");
const pluginReact = require("eslint-plugin-react");
const pluginRnA11y = require("eslint-plugin-rn-a11y");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = [
    {
        ignores: [
            "node_modules/**",
            ".expo/**",
            "dist/**",
            "data/odpt/cache/**",
            "data/odpt/odpt_api.htm",
            "data/odpt/odpt_api_files/**",
        ],
    },
    {
        settings: {
            react: {
                version: "19",
            },
        },
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    pluginReact.configs.flat.recommended,
    {
        plugins: { "rn-a11y": pluginRnA11y },
        rules: {
            "rn-a11y/has-valid-accessibility-actions": "error",
            "rn-a11y/no-deprecated-props": "error",
            "rn-a11y/no-accessibilityLabel-for-testing": "warn",
            "rn-a11y/no-nested-touchables": "error",
            "rn-a11y/no-long-alt": "warn",
            "rn-a11y/no-same-label-and-hint": "error",
            "rn-a11y/image-has-accessible": "warn",
            "rn-a11y/no-use-inverted-virtualizedList": "warn",
            "rn-a11y/touchable-text-has-role": "error",
        },
    },
    {
        files: ["**/*.{js,mjs,ts,tsx}"],
        languageOptions: {
            globals: {
                ...globals.es2022,
                ...globals.node,
            },
        },
        rules: {
            "react/react-in-jsx-scope": "off",
            "react/display-name": "off",
            "react/prop-types": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-require-imports": "off",
        },
    },
    {
        files: ["**/*.mjs"],
        rules: {
            "no-redeclare": "off",
        },
    },
    eslintConfigPrettier,
];
