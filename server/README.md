# Jet Lag CAS server

Content-addressed blob storage plus append-only team timelines for shared game state URLs (`?sid=`).

## Run locally

```bash
pnpm install
pnpm dev
```

Defaults:

- Listens on `0.0.0.0:8787`
- Data directory `./data` (override with `CAS_DATA_DIR`)

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CAS_DATA_DIR` | `./data` | Root for `blobs/` and `teams/` |
| `CAS_PORT` | `8787` | HTTP port |
| `CAS_MAX_BLOB_BYTES` | `5242880` | Max canonical (UTF-8) snapshot size after decompress |
| `CAS_MAX_TEAM_ENTRIES` | `10000` | Max lines per team JSONL log |
| `CAS_CORS_ORIGINS` | `*` | Comma-separated origins or `*` |
| `CAS_STATIC_DIR` | _(unset)_ | Absolute path to Astro **`dist/`** (folder that contains `index.html`; asset URLs still use `base`). When set, this server also hosts the PWA (same origin as `/api/...`). |
| `CAS_STATIC_PREFIX` | `/JetLagHideAndSeek/` | URL prefix for static files; must match [`base` in `astro.config.mjs`](../astro.config.mjs). |

## End-to-end (API + PWA on one port)

### One command (repo root)

After `pnpm install` once:

```bash
pnpm start:app
```

This runs **`pnpm build:all`** (Astro + server TypeScript) then starts Node with `CAS_STATIC_DIR` / `CAS_STATIC_PREFIX` set (via [`scripts/start-stack.mjs`](../scripts/start-stack.mjs)), so you get **API + static PWA on port 8787** without manual env vars.

Faster restarts when nothing changed:

```bash
pnpm start:stack
```

Open **http://localhost:8787/JetLagHideAndSeek/** (or **http://localhost:8787/** — it redirects into that prefix).

### Manual env (same result)

From the **repository root**:

```bash
pnpm install
pnpm build
pnpm --dir server install
pnpm --dir server build
```

Then:

```bash
export CAS_STATIC_DIR="$(pwd)/dist"
export CAS_STATIC_PREFIX="/JetLagHideAndSeek/"
pnpm --dir server start
```

The PWA will probe **`/api/cas/health`** on the same origin, find the CAS API, and enable `?sid=` sharing without configuring “Game state server” in Options.

**Dev split setup (optional):** run `pnpm dev` for Astro (port 4321) and `pnpm --dir server dev` on 8787, then set Options → Game state server URL to `http://localhost:8787`. CORS must allow the Astro origin (`CAS_CORS_ORIGINS`).

## API

- `GET /api/cas/health` — probe (used by the PWA).
- `PUT /api/cas/blobs/:sid` — body is `text/plain` deflate-compressed base64url payload (same format as the PWA `compress()` helper).
- `GET /api/cas/blobs/:sid` — returns stored compressed string.
- `POST /api/teams/:teamId/snapshots` — JSON `{ "sid": "..." }`; blob must exist.
- `GET /api/teams/:teamId/snapshots` — `{ teamId, snapshots: [{ sid, ts }] }`.

Team IDs are capability tokens (`16–32` chars `[A-Za-z0-9_-]`).

## Production (Ubuntu)

1. `pnpm install && pnpm build`
2. Build the frontend (`pnpm build` at repo root) and set `CAS_STATIC_DIR` to `.../dist` (keep `CAS_STATIC_PREFIX` aligned with Astro `base`) so one Node process serves both the PWA and `/api/*`.
3. Run `node dist/index.js` under systemd (see `systemd/jetlag-cas.service`).
4. Put a TLS reverse proxy (Caddy/nginx) in front; no extra “mount static + API” split is required if `CAS_STATIC_DIR` is set.

## Garbage collection

There is no automated GC. Example cron (blobs older than 90 days):

```bash
find "$CAS_DATA_DIR/blobs" -type f -mtime +90 -delete
```

Team JSONL files are not pruned automatically.

## Docker

Build from repo root (context `server/`):

```bash
docker build -t jetlag-cas ./server
docker run -p 8787:8787 -v jetlag-cas-data:/data -e CAS_DATA_DIR=/data jetlag-cas
```
