FROM node:24-slim AS base
# Activate the exact pnpm version declared in package.json.
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

# ── Install ───────────────────────────────────────────────────────────────────
# Separate stage so the node_modules layer is only invalidated when
# package.json or pnpm-lock.yaml actually change — code-only pushes skip
# pnpm install entirely via Docker layer cache.
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prefer-offline

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN NODE_OPTIONS='--max-old-space-size=4096' pnpm build

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
