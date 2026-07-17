# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/install-hooks.mjs scripts/install-hooks.mjs
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/specs/package.json packages/specs/package.json
RUN --mount=type=cache,id=hyrum-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY tsconfig.base.json ./
COPY apps/worker apps/worker
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/env packages/env
COPY packages/logger packages/logger
COPY packages/storage packages/storage
COPY packages/specs packages/specs
RUN pnpm --filter @hyrum/worker build
RUN --mount=type=cache,id=hyrum-pnpm-store,target=/pnpm/store \
    pnpm --filter @hyrum/worker deploy --legacy --prod /prod/worker

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
WORKDIR /app
COPY --from=builder --chown=node:node /prod/worker ./
USER node
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
