# Repo Refactor Plan: Promote `mobile_v2` to Root

## Goal

Make this repository a single Expo app repository centered on the current
`mobile_v2` implementation. The refactor should land on `fork/master`, with
`fork` treated as canonical.

End state:

- The current `mobile_v2` app is promoted to the repository root.
- Legacy `mobile/`, the original Astro/React webapp, old GitHub Pages surface,
  and old root native artifacts are deleted.
- Root commands, docs, checks, and project config all target the Expo app.
- Automatic EAS OTA publishing is removed for now.
- App naming, bundle identifiers, URL scheme, and release policy are not changed
  in this structural refactor.

Future web/server work for `sharing_strat.md` should be added later when that
feature is being implemented. Do not create placeholder `web/` or `server/`
folders during this refactor.

## Locked Decisions

- Preserve old code only through git history and an archive branch.
- Promote `mobile_v2` to root despite the large rename diff.
- Delete old root `ios/`; it is not part of the current app.
- Treat `fork` as the canonical remote.
- Use the promoted app as `master`.
- Remove old GitHub Pages/web hosting completely.
- Add `docs/taibeled_archived.md` as a tiny pointer to the archive branch and
  git history; do not copy old docs or contributor tables into it.
- Do not preserve assets, privacy docs, Sentry config, or Expo/EAS config from
  `mobile/`; recover from history only if needed.
- Delay app/package naming changes.
- Require the full mobile test suite, including E2E, before merge.
- Remove the EAS update workflow until branch policy, app identity, and channels
  are intentionally defined.

## Current Findings

- The repo currently has three app surfaces: root Astro/web code in `src/`,
  legacy Expo code in `mobile/`, and the new Expo SDK 54 app in `mobile_v2/`.
- `pnpm-workspace.yaml` currently includes `.`, `mobile`, and `mobile_v2`.
- Root `package.json` is still Astro-first; its `dev`, `build`, `preview`, and
  `astro` scripts target the webapp.
- `.github/workflows/mobile-v2-checks.yml` already checks `mobile_v2`, but
  should be updated to root commands and `master` branch expectations.
- `.github/workflows/eas-update.yml` currently publishes from
  `working-directory: mobile`; delete it in this refactor.
- `mobile_v2/ios` and `mobile_v2/android` are ignored and untracked. Do not move
  them; keep native projects generated through Expo prebuild.
- `mobile_v2/.gitignore` already ignores native/generated Expo outputs that
  should become root ignores after promotion.
- Local remote refs previously showed `fork/master...mobile` as non-trivial.
  Fetch before implementing and merge/rebase deliberately.

## Implementation Plan

### 1. Safety Snapshot

1. Fetch all remotes:

    ```bash
    git fetch --all --prune
    git branch --all --verbose --no-abbrev
    git rev-list --left-right --count fork/master...mobile
    ```

2. Create an archive branch before the destructive refactor:

    ```bash
    git switch mobile
    git branch archive/taibeled-pre-mobile-v2-root
    git push fork archive/taibeled-pre-mobile-v2-root
    ```

3. Create the implementation branch:

    ```bash
    git switch -c codex/mobile-v2-root-refactor
    ```

4. Run baseline checks before structural edits:

    ```bash
    pnpm --dir mobile_v2 check
    pnpm --dir mobile_v2 test
    pnpm --dir mobile_v2 test:e2e:ios:stack
    ```

### 2. Delete Obsolete Surfaces

Delete:

- `mobile/`
- old root `src/`
- old root `tests/`
- `public/`
- `.astro/`
- `dist/`
- root `ios/`
- `astro.config.mjs`
- `tailwind.config.mjs`
- `components.json`
- `vitest.config.ts`
- old web-oriented root `tsconfig.json` and `eslint.config.js` content
- old GitHub Pages deploy workflow, if present after fetch
- `.github/workflows/eas-update.yml`

Keep:

- `LICENSE`, unless a separate licensing decision is made.
- `.github/workflows/mobile-v2-checks.yml`, but rewrite it for the root app.
- `.github/dependabot.yml`, but keep it pointed at `/`.

### 3. Promote `mobile_v2` to Root

Move tracked project files from `mobile_v2/` to root:

```bash
git mv mobile_v2/app app
git mv mobile_v2/assets assets
git mv mobile_v2/data data
git mv mobile_v2/docs docs
git mv mobile_v2/e2e e2e
git mv mobile_v2/src src
git mv mobile_v2/scripts scripts
git mv mobile_v2/AGENTS.md AGENTS.md
git mv mobile_v2/app.json app.json
git mv mobile_v2/babel.config.js babel.config.js
git mv mobile_v2/eslint.config.js eslint.config.js
git mv mobile_v2/jest.config.js jest.config.js
git mv mobile_v2/jest.setup.ts jest.setup.ts
git mv mobile_v2/metro.config.js metro.config.js
git mv mobile_v2/opencode.json opencode.json
git mv mobile_v2/package.json package.json
git mv mobile_v2/tsconfig.json tsconfig.json
```

Do not move `mobile_v2/ios` or `mobile_v2/android`; they are ignored/generated
native projects. Delete the now-empty `mobile_v2/` directory after tracked files
are moved.

### 4. Rewrite Root Project Config

- Make root `package.json` the promoted Expo package.
- Preserve the previous root `packageManager` field.
- Keep app identifiers, slug, scheme, and package name unchanged for now.
- Ensure root scripts are direct commands:
    - `pnpm start`
    - `pnpm ios`
    - `pnpm android`
    - `pnpm web`
    - `pnpm lint`
    - `pnpm lint:fix`
    - `pnpm format`
    - `pnpm format:check`
    - `pnpm typecheck`
    - `pnpm check`
    - `pnpm test`
    - `pnpm test:e2e:ios`
    - `pnpm test:e2e:ios:stack`
- Simplify or remove `pnpm-workspace.yaml`. If kept, make it single-package:

    ```yaml
    packages:
        - .
    nodeLinker: hoisted
    ```

- Run `pnpm install` after manifest/workspace edits so `pnpm-lock.yaml` drops
  web and legacy-mobile dependencies.

### 5. Rewrite Paths and Docs

Update references from `mobile_v2/...` to root-relative paths in:

- docs
- scripts
- E2E notes
- ODPT notices and generated metadata
- workflow path filters
- README and agent guide

Root docs should describe the Expo app only. `docs/mobile_v2_notes.md` may stay
as historical planning, but should no longer imply the app is a side project.

Create `docs/taibeled_archived.md` with a short note like:

```md
# Archived Upstream Project

This fork used to contain the original taibeled web app and an older mobile
experiment. Those files were removed when the Expo rewrite was promoted to the
repository root.

See branch `archive/taibeled-pre-mobile-v2-root` or git history to recover the
old implementation.
```

### 6. Update Ignore and CI

Root ignore rules should include:

```gitignore
node_modules/
.expo/
dist/
build/
coverage/
ios/
android/
*.log
e2e/artifacts/
data/odpt/cache/
data/odpt/odpt_api.htm
data/odpt/odpt_api_files/
```

Update `.github/workflows/mobile-v2-checks.yml`:

- Rename if desired, e.g. `app-checks.yml`.
- Trigger on pull requests and pushes to `master`.
- Run from root:

    ```bash
    pnpm install --frozen-lockfile
    pnpm check
    pnpm test
    ```

Delete `.github/workflows/eas-update.yml`. EAS OTA should be reintroduced only
after a separate release-policy decision.

## Verification

After the refactor:

```bash
pnpm install
pnpm check
pnpm test
pnpm exec expo config --type public
pnpm test:e2e:ios:stack
```

Also search for stale references:

```bash
rg -n "mobile_v2|mobile/|working-directory: mobile|astro|GitHub Pages|taibeled.github.io"
```

Expected remaining hits should be only intentional historical notes, if any.

## Merge Plan

1. Rebase or merge latest `fork/master` into `codex/mobile-v2-root-refactor`.
2. Resolve conflicts intentionally around deleted web files, root package files,
   workflows, README, and lockfile.
3. Open a PR to `fork/master`.
4. Merge only after root checks and E2E pass.
5. Leave `origin` alone unless a separate decision is made to upstream the fork.

## Stop Conditions

Pause if:

- baseline `mobile_v2` checks fail before edits.
- root Expo config fails after promotion.
- E2E fails in a way that is not clearly environmental.
- fetch shows `fork/master` has changed enough to require rethinking the merge.
- Expo/EAS metadata unexpectedly points at a production app that should not be
  touched by this structural refactor.
