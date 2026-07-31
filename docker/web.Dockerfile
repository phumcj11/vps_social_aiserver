# syntax=docker/dockerfile:1
# KMKT Social AI — Web image (foundation, not built in SPRINT 001).
# Multi-stage Next.js build using Node 22 LTS and pnpm via Corepack.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# --- Install workspace dependencies ---------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile || pnpm install

# --- Build ----------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
RUN pnpm --filter @kmkt/web build

# --- Runtime --------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web ./apps/web
USER node
WORKDIR /app/apps/web
CMD ["pnpm", "start"]
