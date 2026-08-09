FROM node:26.7.0-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/install-hooks.mjs scripts/install-hooks.mjs
COPY apps/control-plane/package.json apps/control-plane/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/openai/package.json packages/openai/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY tsconfig.base.json turbo.json ./
COPY apps/control-plane apps/control-plane
COPY apps/worker apps/worker
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/env packages/env
COPY packages/integrations packages/integrations
COPY packages/logger packages/logger
COPY packages/openai packages/openai
COPY packages/storage packages/storage
# BuildKit's source copies replace the manifest-only workspace directories from the dependency
# stage. Relink their package-local node_modules from the populated offline store before bundling.
RUN pnpm install --offline --frozen-lockfile \
  && pnpm --filter @hyrum/control-plane build \
  && pnpm --filter @hyrum/worker build \
  && pnpm --filter @hyrum/control-plane deploy --legacy --prod /deploy/control-plane \
  && pnpm --filter @hyrum/worker deploy --legacy --prod /deploy/worker

FROM node:26.7.0-alpine AS runner
ENV NODE_ENV=production
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/yarn \
  && addgroup --system --gid 1001 hyrum \
  && adduser --system --uid 1001 --ingroup hyrum hyrum
WORKDIR /app
COPY --from=builder --chown=hyrum:hyrum /deploy/control-plane ./control-plane
COPY --from=builder --chown=hyrum:hyrum /deploy/worker ./worker
USER hyrum
EXPOSE 4000
CMD ["node", "control-plane/dist/server.js"]
