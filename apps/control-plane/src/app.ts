import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { problemDetailsSchema } from "@hyrum/contracts";
import type { RuntimeEnv } from "@hyrum/env";
import { createLogger } from "@hyrum/logger";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { authPlugin } from "./plugins/auth";
import { databasePlugin } from "./plugins/database";
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
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensible);
  await app.register(cors, { origin: env.WEB_URL, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: {
      info: { title: "Hyrum Control Plane API", version: "0.1.0" },
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs", uiConfig: { docExpansion: "list" } });

  if (includeDatabase) await app.register(databasePlugin, { env });
  await app.register(authPlugin, {
    jwksUrl: process.env.WORKOS_JWKS_URL,
    issuer: process.env.WORKOS_ISSUER,
    audience: process.env.WORKOS_AUDIENCE,
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
          instance: request.url,
          requestId: request.id,
        }),
      );
  });

  app.setErrorHandler((error, request, reply) => {
    const normalizedError = error instanceof Error ? error : new Error("Unknown request failure");
    const candidateStatus =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 500;
    request.log.error({ err: normalizedError }, "request failed");
    const status = candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500;
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
        detail,
        instance: request.url,
        requestId: request.id,
      });
  });

  return app;
}
