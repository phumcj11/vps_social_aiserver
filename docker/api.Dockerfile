# syntax=docker/dockerfile:1
# KMKT Social AI — API image (foundation, not built in SPRINT 001).
# Multi-stage build using Node 22 LTS and pnpm via Corepack.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- Install workspace dependencies ---------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile || pnpm install

# --- Build ----------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
RUN pnpm --filter @kmkt/api build

# --- Runtime --------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# Runs as the non-root `node` user provided by the base image.
USER node
CMD ["node", "apps/api/dist/index.js"]
