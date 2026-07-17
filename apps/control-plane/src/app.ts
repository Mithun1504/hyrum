import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { problemDetailsSchema } from "@hyrum/contracts";
import type { RuntimeEnv } from "@hyrum/env";
import { createLogger } from "@hyrum/logger";
import { WorkOS } from "@workos-inc/node";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { authPlugin } from "./plugins/auth";
import { databasePlugin } from "./plugins/database";
import { storagePlugin } from "./plugins/storage";
import { healthRoutes } from "./routes/health";
import { v1Routes } from "./routes/v1/index";

export interface BuildAppOptions {
  env: RuntimeEnv;
  includeDatabase?: boolean;
}

export async function buildApp({ env, includeDatabase = true }: BuildAppOptions) {
  const app = Fastify({
    loggerInstance: createLogger("control-plane", env.LOG_LEVEL),
    requestIdHeader: "x-request-id",
    trustProxy: env.CONTROL_PLANE_TRUST_PROXY_CIDRS
      ? env.CONTROL_PLANE_TRUST_PROXY_CIDRS.split(",").map((value) => value.trim())
      : false,
    bodyLimit: 1_048_576,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("webUrl", env.WEB_URL);
  await app.register(sensible);
  await app.register(cors, { origin: env.WEB_URL, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: { title: "Hyrum Control Plane API", version: "0.1.0" },
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs", uiConfig: { docExpansion: "list" } });

  if (includeDatabase) await app.register(databasePlugin, { env });
  await app.register(storagePlugin, { env });
  const workos = env.WORKOS_API_KEY
    ? new WorkOS({
        apiKey: env.WORKOS_API_KEY,
        ...(env.WORKOS_CLIENT_ID ? { clientId: env.WORKOS_CLIENT_ID } : {}),
        timeout: 3_000,
      })
    : undefined;
  await app.register(authPlugin, {
    clientId: env.WORKOS_CLIENT_ID,
    jwksUrl: env.WORKOS_JWKS_URL,
    issuer: env.WORKOS_ISSUER,
    workos,
  });
  app.setErrorHandler((error, request, reply) => {
    const normalizedError = error instanceof Error ? error : new Error("Unknown request failure");
    const candidateStatus =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 500;
    request.log.error({ err: normalizedError }, "request failed");
    const status = candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500;
    const code =
      error instanceof ZodError
        ? "validation_failed"
        : status === 404
          ? "not_found"
          : "request_failed";
    const detail =
      error instanceof ZodError
        ? "Request validation failed"
        : status < 500
          ? normalizedError.message
          : undefined;
    reply
      .code(status)
      .type("application/problem+json")
      .send({
        type: "about:blank",
        title: status === 500 ? "Internal Server Error" : normalizedError.name,
        status,
        error: status === 500 ? "Internal Server Error" : normalizedError.message,
        code,
        detail,
        instance: request.url,
        requestId: request.id,
      });
  });

  await app.register(healthRoutes);
  await app.register(v1Routes, { prefix: "/v1" });

  app.setNotFoundHandler((request, reply) => {
    reply
      .code(404)
      .type("application/problem+json")
      .send(
        problemDetailsSchema.parse({
          type: "about:blank",
          title: "Not Found",
          status: 404,
          error: "Not Found",
          code: "not_found",
          instance: request.url,
          requestId: request.id,
        }),
      );
  });

  return app;
}
