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
COPY apps/control-plane/package.json apps/control-plane/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/specs/package.json packages/specs/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN --mount=type=cache,id=hyrum-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY tsconfig.base.json ./
COPY apps/control-plane apps/control-plane
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/env packages/env
COPY packages/logger packages/logger
COPY packages/specs packages/specs
COPY packages/storage packages/storage
RUN pnpm --filter @hyrum/control-plane build
RUN --mount=type=cache,id=hyrum-pnpm-store,target=/pnpm/store \
    pnpm --filter @hyrum/control-plane deploy --legacy --prod /prod/control-plane

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
WORKDIR /app
COPY --from=builder --chown=node:node /prod/control-plane ./
USER node
EXPOSE 4000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.CONTROL_PLANE_PORT||4000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
