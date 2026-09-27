FROM node:26.10.0-alpine
ARG DEMO_VARIANT
RUN test "$DEMO_VARIANT" = "base" -o "$DEMO_VARIANT" = "candidate"
WORKDIR /app
COPY demo/api/server.mjs ./server.mjs
ENV DEMO_VARIANT=$DEMO_VARIANT
ENV PORT=4100
USER node
EXPOSE 4100
CMD ["node", "server.mjs"]
