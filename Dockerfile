FROM node:24-slim AS base
# Activate the exact pnpm version declared in package.json.
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

# ── Install ───────────────────────────────────────────────────────────────────
# Separate stage so the node_modules layer is only invalidated when
# package.json or pnpm-lock.yaml actually change.
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# Cache the pnpm store (downloaded tarballs) between builds.
# node_modules is written to the image layer normally so the build stage
# can read it without any cache mount tricks.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --prefer-offline --store-dir /pnpm-store

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Cache .astro so Vite reuses incremental compilation artifacts for unchanged
# source files across builds.
RUN --mount=type=cache,id=astro-cache,target=/app/.astro \
    NODE_OPTIONS='--max-old-space-size=4096' pnpm build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
WORKDIR /app
ENV HOST=0.0.0.0
ENV NODE_OPTIONS='--max-old-space-size=1024'
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 3000
CMD ["node", "./dist/server/entry.mjs"]
