# syntax=docker/dockerfile:1
# KMKT Social AI — Worker image (foundation, not built in SPRINT 001).
# Shared by the Facebook scanner (read-only) and comment (write) workers.
# The specific worker is selected via the WORKER_DIR build argument.
#
# NOTE: These workers are DISABLED placeholders in this sprint. They do not
# import or execute Playwright. Playwright/browser tooling will be added to a
# dedicated worker image only when the workers are actually implemented.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG WORKER_DIR
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY ${WORKER_DIR}/package.json ${WORKER_DIR}/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.base.json ./
COPY ${WORKER_DIR} ./${WORKER_DIR}
RUN pnpm --filter "./${WORKER_DIR}" build

FROM base AS runtime
ARG WORKER_DIR
ENV NODE_ENV=production
ENV WORKER_ENTRY=/app/${WORKER_DIR}/dist/index.js
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/${WORKER_DIR}/dist ./${WORKER_DIR}/dist
COPY --from=build /app/${WORKER_DIR}/package.json ./${WORKER_DIR}/package.json
USER node
# The placeholder entrypoint logs that it is disabled and exits 0.
CMD ["sh", "-c", "node $WORKER_ENTRY"]
