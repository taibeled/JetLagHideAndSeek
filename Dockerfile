FROM node:24-slim AS base
# Activate the exact pnpm version declared in package.json.
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# ── Install ───────────────────────────────────────────────────────────────────
# Separate stage so the node_modules layer is only invalidated when
# package.json or pnpm-lock.yaml actually change — code-only pushes skip
# pnpm install entirely via Docker layer cache.
FROM base AS deps
WORKDIR /app
# pnpm-workspace.yaml carries `minimumReleaseAge: 0` — without it, pnpm 11's
# default supply-chain age policy rejects freshly-published packages (e.g. an
# astro point release from today), failing `--frozen-lockfile` in the container.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN NODE_OPTIONS='--max-old-space-size=4096' pnpm build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
WORKDIR /app
# Run as a non-root user for security.
RUN groupadd --system appgroup && useradd --system --gid appgroup --no-create-home appuser
ENV HOST=0.0.0.0
ENV NODE_OPTIONS='--max-old-space-size=1024'
COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --chown=appuser:appgroup package.json ./
USER appuser
# Informational only — the @astrojs/node adapter listens on $PORT (Railway
# injects it) and falls back to 4321, the adapter's default.
EXPOSE 4321
# Probe the real route the app serves ("/" — same as railway.json's
# healthcheckPath) on the actual runtime port ($PORT, default 4321), not a
# hardcoded 3000 or a non-existent /health endpoint.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "const p=process.env.PORT||4321;require('http').get('http://localhost:'+p+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "./dist/server/entry.mjs"]
