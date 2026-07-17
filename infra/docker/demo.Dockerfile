FROM node:24.4.1-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @hyrum/demo build

FROM node:24.4.1-alpine AS runtime
ENV NODE_ENV=production PORT=4100
WORKDIR /app
COPY --from=build /app/apps/demo/dist ./dist
COPY --from=build /app/apps/demo/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 4100
CMD ["node", "dist/server.js"]
