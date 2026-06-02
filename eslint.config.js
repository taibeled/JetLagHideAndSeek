import importAlias from "@dword-design/eslint-plugin-import-alias";
import pluginJs from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import pluginAstro from "eslint-plugin-astro";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

/** @typescript-eslint `recommended` includes a rules-only block with no `files`; scope it to TS. */
const typescriptEslintRecommended = tseslint.configs.recommended.map(
    (config) =>
        config.name === "typescript-eslint/recommended"
            ? {
                  ...config,
                  files: ["**/*.{ts,tsx,mts,cts}"],
              }
            : config,
);

/** @type {import('eslint').Linter.Config[]} */
export default [
    // Agent sandboxes checked out as locked git worktrees under
    // `.claude/worktrees/**` carry their own tsconfig.json and would
    // otherwise confuse typescript-eslint's tsconfigRootDir detection
    // (multiple candidate roots → parsing error on every file).
    // They're gitignored and untracked — no reason to lint them.
    { ignores: [".claude/**", "dist/**", ".astro/**"] },
    { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
    { languageOptions: { globals: globals.browser } },
    pluginJs.configs.recommended,
    ...typescriptEslintRecommended,
    // After typescript-eslint/base (global parser). Astro overrides `*.astro`
    // when `@typescript-eslint/parser` is a direct devDependency (pnpm).
    ...pluginAstro.configs["flat/recommended"],
    // @eslint-react runs on TS/TSX only. Astro files have an Astro-specific
    // JSX-like syntax that would false-positive on many React rules, and
    // plain .js/.mjs/.cjs aren't React components in this codebase.
    {
        files: ["**/*.{ts,tsx}"],
        ...eslintReact.configs["recommended-typescript"],
        // https://www.eslint-react.xyz/docs/configuration/configure-analyzer
        settings: {
            "react-x": {
                // Keep in sync with `dependencies.react` in package.json.
                version: "19.2.7",
                importSource: "react",
            },
        },
        rules: {
            // Flags `(() => { ... })()` in JSX because React Compiler
            // can't optimize IIFEs. We don't run React Compiler, and the
            // pattern is actually useful for locally-scoped bindings in
            // JSX without hoisting a helper. Re-enable if we ever adopt
            // React Compiler.
            "@eslint-react/unsupported-syntax": "off",
        },
    },
    // Shadcn/ui templates ship with React-19-incompatible-by-default
    // patterns (`forwardRef`, `<Context.Provider>`, `useContext`) on
    // purpose to stay portable across React versions. Don't diverge from
    // upstream here — the entire `src/components/ui/**` tree is vendored
    // and re-synced occasionally. Also covers common shadcn idioms like
    // controlled-input effects and `children` passed as a prop inside
    // primitive wrappers.
    {
        files: ["src/components/ui/**/*.{ts,tsx}"],
        rules: {
            "@eslint-react/no-forward-ref": "off",
            "@eslint-react/no-context-provider": "off",
            "@eslint-react/no-use-context": "off",
            "@eslint-react/use-state": "off",
            "@eslint-react/naming-convention-ref-name": "off",
            "@eslint-react/set-state-in-effect": "off",
            "@eslint-react/exhaustive-deps": "off",
            "@eslint-react/jsx-no-children-prop": "off",
            "@eslint-react/purity": "off",
        },
    },
    // Node config files — `process`, `require`, etc. (the default
    // browser globals block above wrongly marks `process` as undefined).
    {
        files: ["astro.config.mjs", "tailwind.config.mjs", "eslint.config.js"],
        languageOptions: { globals: globals.node },
    },
    {
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off", // Would be great to remove all `any` types...
            // Treat `_`-prefixed names as intentionally unused. Matches
            // the TypeScript compiler's own ts(6133) convention so the
            // two tools agree on what counts as "unused".
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                },
            ],
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
        },
    },
    // Prefer `@/` (and other `tsconfig` paths) over long `../` chains.
    // `aliasForSubpaths: true` keeps sibling/child imports on `@/…` too
    // (the plugin default only rewrites parent `../` paths).
    // Scoped to real TS/TSX; virtual `*.astro.ts` chunks are ignored.
    {
        files: ["**/*.{ts,tsx}"],
        ignores: ["**/*.astro.ts", "**/*.astro.js"],
        plugins: importAlias.configs.recommended.plugins,
        rules: {
            "@dword-design/import-alias/prefer-alias": [
                "error",
                { aliasForSubpaths: true },
            ],
        },
    },
];
