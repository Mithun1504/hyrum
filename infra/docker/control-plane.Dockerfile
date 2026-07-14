FROM node:22.22.1-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/control-plane/package.json apps/control-plane/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/logger/package.json packages/logger/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY tsconfig.base.json turbo.json ./
COPY apps/control-plane apps/control-plane
COPY apps/worker apps/worker
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/env packages/env
COPY packages/logger packages/logger
RUN pnpm --filter @hyrum/control-plane build && pnpm --filter @hyrum/worker build

FROM node:22.22.1-alpine AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 hyrum && adduser --system --uid 1001 --ingroup hyrum hyrum
WORKDIR /app
COPY --from=builder --chown=hyrum:hyrum /app/apps/control-plane/dist ./control-plane
COPY --from=builder --chown=hyrum:hyrum /app/apps/worker/dist ./worker
USER hyrum
EXPOSE 4000
CMD ["node", "control-plane/server.js"]
